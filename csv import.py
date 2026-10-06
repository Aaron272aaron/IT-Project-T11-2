"""Import Canvas quiz CSVs, save marking progress, and export final marks.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sqlite3
import tempfile
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path


QUESTION_HEADER = re.compile(r"^(\d+)\s*:\s*(.*)$", re.DOTALL)
QUESTION_TYPES = {"short_answer", "executable_code", "function", "instruction", "unclassified"}
MAX_STUDENTS = 10_000
# A quoted code answer may be much longer than the csv module's default limit.
csv.field_size_limit(8 * 1024 * 1024)


@dataclass
class Issue:
    """A location and explanation, without copying student answers into logs."""

    severity: str
    record: int  # Header = 1; first student record = 2 (not physical file lines).
    column: str
    message: str


@dataclass
class Question:
    question_id: str
    text: str
    max_mark: str
    kind: str
    answer_column: int


@dataclass
class ImportData:
    questions: list[Question] = field(default_factory=list)
    students: list[dict] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)
    headers: list[str] = field(default_factory=list)

    @property
    def errors(self) -> list[Issue]:
        return [issue for issue in self.issues if issue.severity == "error"]

    def summary(self) -> dict:
        return {
            "students": len(self.students),
            "questions_including_instructions": len(self.questions),
            "markable_questions": sum(q.kind != "instruction" for q in self.questions),
            "answer_records": sum(len(s["answers"]) for s in self.students),
            "errors": len(self.errors),
            "warnings": sum(i.severity == "warning" for i in self.issues),
        }


class ValidationError(ValueError):
    def __init__(self, issues: list[Issue]):
        self.issues = issues
        super().__init__(f"Import rejected: {len(issues)} validation error(s).")


class IncompleteMarksError(ValueError):
    def __init__(self, missing: dict[str, list[str]]):
        self.missing = missing
        super().__init__(
            f"Export blocked: {len(missing)} student(s) have unmarked questions. "
            "Review missing marks; use --allow-incomplete only to confirm a partial export."
        )


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def number(value: str, label: str) -> Decimal:
    """Decimal avoids floating-point errors such as 0.1 + 0.2 != 0.3."""
    try:
        result = Decimal(value)
    except (InvalidOperation, ValueError):
        raise ValueError(f"{label} must be a number.") from None
    if not result.is_finite():
        raise ValueError(f"{label} must be finite (not NaN or Infinity).")
    return result


def load_config(path: str | Path | None) -> dict:
    if path is None:
        return {}
    with Path(path).open(encoding="utf-8") as stream:
        config = json.load(stream)
    if not isinstance(config, dict):
        raise ValueError("Configuration must be a JSON object.")
    return config


def validate_config(config: dict) -> None:
    """Only explicitly configured whitespace replacements are permitted."""
    allowed = {"student_id_column", "question_types", "short_answer_whitespace"}
    if set(config) - allowed:
        raise ValueError(f"Unknown configuration keys: {sorted(set(config) - allowed)}")
    if config.get("student_id_column", "sis_id") not in {"sis_id", "id"}:
        raise ValueError("student_id_column must be 'sis_id' or 'id'.")
    kinds = config.get("question_types", {})
    if not isinstance(kinds, dict) or any(not isinstance(v, str) or v not in QUESTION_TYPES for v in kinds.values()):
        raise ValueError(f"question_types must map question IDs to one of {sorted(QUESTION_TYPES)}.")
    rules = config.get("short_answer_whitespace", {})
    if not isinstance(rules, dict):
        raise ValueError("short_answer_whitespace must be an object.")
    for old, new in rules.items():
        if len(old) != 1 or not old.isspace() or not isinstance(new, str) or not new or not new.isspace():
            raise ValueError("Whitespace rules must replace one whitespace character with whitespace.")


def prepare_answer(raw: str, kind: str, rules: dict[str, str]) -> str:
    # Never strip code: even trailing whitespace or a tab may matter to a marker.
    if kind != "short_answer":
        return raw
    for old, new in rules.items():
        raw = raw.replace(old, new)
    # FR1.4 requires trailing whitespace removal for short answers only.
    return raw.rstrip()


def read_canvas_csv(path: str | Path, config: dict | None = None) -> ImportData:
    """Validate a whole file before saving anything. Blank answers are retained.

    This supports the supplied Canvas *Quiz Student Analysis Report* format,
    not arbitrary CSVs or Canvas gradebook exports. It deliberately uses reader,
    not DictReader: the supplied score headers repeat (e.g. several '2.0's).
    """
    config = config or {}
    validate_config(config)
    path = Path(path)
    result = ImportData()

    def issue(severity: str, record: int, column: str, message: str) -> None:
        result.issues.append(Issue(severity, record, column, message))

    if path.suffix.lower() != ".csv":
        issue("error", 0, "file", "Expected a .csv file.")
        return result
    record = 1
    try:
        # utf-8-sig reads UTF-8 both with and without an Excel-style BOM.
        # newline='' lets csv handle quoted multiline fields without changing CRLF.
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.reader(stream, strict=True)
            result.headers = next(reader, [])
            headers = result.headers
            if not headers:
                issue("error", 1, "header", "The CSV is empty.")
                return result
            if any("\x00" in h for h in headers):
                issue("error", 1, "header", "NUL character in a header; file may be corrupted.")
                return result
            cleaned = [h.rstrip() for h in headers]
            id_column = config.get("student_id_column", "sis_id")
            required = {id_column, "id", "attempt"}
            for name in sorted(required):
                if cleaned.count(name) != 1:
                    issue("error", 1, name, "Required metadata column is missing or repeated.")
            if result.errors:
                return result

            seen_questions = set()
            question_columns = set()
            for index, header in enumerate(headers):
                match = QUESTION_HEADER.fullmatch(header)
                if not match:
                    continue
                qid, text = match.groups()
                if qid in seen_questions:
                    issue("error", 1, qid, "Repeated question ID is ambiguous.")
                    continue
                seen_questions.add(qid)
                try:
                    if index + 1 >= len(headers):
                        raise ValueError("Question has no adjacent maximum-mark column.")
                    maximum = number(headers[index + 1], "Question maximum")
                    if maximum < 0 or not text.strip():
                        raise ValueError("Question needs text and a non-negative maximum mark.")
                except ValueError as error:
                    issue("error", 1, qid, str(error))
                    continue
                # These seven section introductions in the supplied file have 0 marks.
                # Other zero-mark questions remain markable unless explicitly configured.
                is_intro = maximum == 0 and re.match(r"Part\s+\d+\b", text) is not None
                default_kind = "instruction" if is_intro else "unclassified"
                kind = config.get("question_types", {}).get(qid, default_kind)
                if kind == "instruction" and maximum != 0:
                    issue("error", 1, qid, "A positive-mark question cannot be an instruction.")
                if kind == "unclassified":
                    issue("warning", 1, qid, "Question type not configured; answer formatting is preserved unchanged.")
                result.questions.append(Question(qid, text, str(maximum), kind, index))
                question_columns.update({index, index + 1})
            # Unknown columns may be damaged question headers. Reject them instead of
            # quietly dropping one question while importing all the other questions.
            metadata_headers = {"name", "id", "sis_id", "section", "section_id",
                                "section_sis_id", "submitted", "attempt",
                                "n correct", "n incorrect", "score"}
            for index, header in enumerate(cleaned):
                if index not in question_columns and header not in metadata_headers:
                    issue("error", 1, f"column {index + 1}", "Unrecognised column; check the Canvas question/score layout.")
            unknown = set(config.get("question_types", {})) - seen_questions
            if unknown:
                issue("error", 1, "question_types", f"Configured question IDs not in this file: {sorted(unknown)}")
            if not result.questions:
                issue("error", 1, "header", "No Canvas question/maximum-mark column pairs found.")
            if result.errors:
                return result

            # Track both identifiers so a Canvas user cannot silently map to two SIS IDs.
            seen_students: dict[str, int] = {}
            seen_canvas: dict[str, int] = {}
            for record, row in enumerate(reader, start=2):
                if record - 1 > MAX_STUDENTS:
                    issue("error", record, "file", f"Maximum is {MAX_STUDENTS:,} student rows.")
                    break
                if len(row) != len(headers):
                    issue("error", record, "row", f"Expected {len(headers)} cells; found {len(row)}.")
                    continue
                if any("\x00" in cell for cell in row):
                    issue("error", record, "row", "NUL character found; file may be corrupted.")
                    continue
                student_id = row[cleaned.index(id_column)].rstrip()
                canvas_id = row[cleaned.index("id")].rstrip()
                attempt = row[cleaned.index("attempt")].rstrip()
                if not student_id.strip() or not canvas_id.strip():
                    issue("error", record, id_column, "Student ID and Canvas ID must not be blank.")
                    continue
                if not re.fullmatch(r"[1-9][0-9]*", attempt):
                    issue("error", record, "attempt", "Attempt must be a positive integer.")
                if student_id in seen_students or canvas_id in seen_canvas:
                    previous = seen_students.get(student_id, seen_canvas.get(canvas_id))
                    issue("error", record, id_column, f"Duplicate or ambiguous student/attempt; also see record {previous}. Select the intended attempt before importing.")
                seen_students[student_id] = record
                seen_canvas[canvas_id] = record
                answers = []
                for question in result.questions:
                    raw = row[question.answer_column]
                    source_score = row[question.answer_column + 1]
                    flags = []
                    if not raw.strip() and question.kind != "instruction":
                        flags.append("blank_answer")
                        issue("warning", record, question.question_id, "Blank answer retained for human review; no zero mark assigned.")
                    if any(ord(c) > 127 and (c.isspace() or c in "\u200b\ufeff\ufffd") for c in raw):
                        flags.append("unicode_formatting_review")
                        issue("warning", record, question.question_id, "Non-standard whitespace or replacement character detected; original retained.")
                    if source_score.strip():
                        try:
                            score = number(source_score, "Canvas score")
                            if not Decimal(0) <= score <= Decimal(question.max_mark):
                                raise ValueError("Canvas score is outside the question's mark range.")
                        except ValueError as error:
                            issue("error", record, question.question_id, str(error))
                    else:
                        flags.append("missing_source_score")
                        issue("warning", record, question.question_id, "Canvas score is blank; imported as source metadata only.")
                    answers.append({
                        "question_id": question.question_id,
                        "original_answer": raw,
                        "prepared_answer": prepare_answer(raw, question.kind, config.get("short_answer_whitespace", {})),
                        "source_score": source_score,
                        "status": "not_applicable" if question.kind == "instruction" else "unmarked",
                        "review_flags": flags,
                    })
                result.students.append({
                    "student_id": student_id,
                    "canvas_id": canvas_id,
                    "attempt": attempt,
                    "source_record": record,
                    "answers": answers,
                })
            if record == 1:
                issue("error", 2, "file", "The CSV contains a header but no student records.")
    except (csv.Error, UnicodeError) as error:
        # Invalid encoding/quoting makes the whole import unsafe, so it is rejected.
        # Do not include decoder exceptions: they may expose fragments of student data.
        issue("error", record, "file", f"Cannot parse CSV ({type(error).__name__}); check UTF-8 encoding, quoting, and field size.")
    return result


SCHEMA = """
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE questions (
    question_id TEXT PRIMARY KEY, question_text TEXT NOT NULL,
    max_mark TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL
);
CREATE TABLE students (
    student_id TEXT PRIMARY KEY, canvas_id TEXT NOT NULL UNIQUE,
    attempt TEXT NOT NULL, source_record INTEGER NOT NULL
);
CREATE TABLE answers (
    student_id TEXT NOT NULL REFERENCES students(student_id),
    question_id TEXT NOT NULL REFERENCES questions(question_id),
    original_answer TEXT NOT NULL, prepared_answer TEXT NOT NULL,
    source_score TEXT NOT NULL, review_flags TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('unmarked','marked','not_applicable')),
    final_mark TEXT, comment TEXT NOT NULL DEFAULT '',
    marked_by TEXT, marked_at TEXT,
    PRIMARY KEY(student_id, question_id),
    CHECK((status = 'marked' AND final_mark IS NOT NULL) OR
          (status != 'marked' AND final_mark IS NULL))
);
CREATE TABLE mark_history (
    change_id INTEGER PRIMARY KEY, student_id TEXT NOT NULL, question_id TEXT NOT NULL,
    previous_mark TEXT, new_mark TEXT NOT NULL,
    previous_comment TEXT NOT NULL, new_comment TEXT NOT NULL,
    marker TEXT NOT NULL, changed_at TEXT NOT NULL,
    FOREIGN KEY(student_id, question_id) REFERENCES answers(student_id, question_id)
);
PRAGMA user_version = 1;
"""


def open_database(path: str | Path, *, create: bool = False) -> sqlite3.Connection:
    path = Path(path)
    if not create and not path.is_file():
        raise ValueError("Database does not exist. Import the CSV first.")
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    version = connection.execute("PRAGMA user_version").fetchone()[0]
    if version == 0 and create:
        if connection.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchone():
            connection.close()
            raise ValueError("Existing database has an unknown schema; use a new database path.")
        connection.executescript(SCHEMA)
    elif version != 1:
        connection.close()
        raise ValueError("Unsupported marking database version.")
    return connection


def import_canvas_csv(csv_path: str | Path, database_path: str | Path, config: dict | None = None) -> ImportData:
    """One exam per database. Never overwrite an existing exam or saved marks."""
    data = read_canvas_csv(csv_path, config)
    if data.errors:
        raise ValidationError(data.errors)
    connection = open_database(database_path, create=True)
    try:
        # The transaction means all records are saved together, or none are saved.
        with connection:
            connection.execute("BEGIN IMMEDIATE")
            if connection.execute("SELECT 1 FROM metadata").fetchone():
                raise ValueError("Database already contains an import. Use a new database for a new exam or corrected CSV.")
            connection.executemany("INSERT INTO metadata VALUES (?, ?)", [
                ("imported_at", utc_now()),
                ("source_filename", Path(csv_path).name),
                ("config", json.dumps(config or {}, ensure_ascii=False)),
                ("source_headers", json.dumps(data.headers, ensure_ascii=False)),
            ])
            connection.executemany("INSERT INTO questions VALUES (?, ?, ?, ?, ?)", [
                (q.question_id, q.text, q.max_mark, q.kind, index)
                for index, q in enumerate(data.questions)
            ])
            connection.executemany("INSERT INTO students VALUES (?, ?, ?, ?)", [
                (s["student_id"], s["canvas_id"], s["attempt"], s["source_record"])
                for s in data.students
            ])
            connection.executemany(
                """INSERT INTO answers (student_id, question_id, original_answer,
                   prepared_answer, source_score, review_flags, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                ((s["student_id"], a["question_id"], a["original_answer"],
                  a["prepared_answer"], a["source_score"],
                  json.dumps(a["review_flags"]), a["status"])
                 for s in data.students for a in s["answers"]),
            )
    finally:
        connection.close()
    return data


def save_mark(database_path: str | Path, student_id: str, question_id: str,
              mark: str, marker: str, comment: str = "") -> None:
    """Save a human-entered mark and audit entry in a single transaction.

    A web application must authenticate the human before calling this function.
    The marker string is an audit label, not an authentication mechanism.
    """
    value = number(mark, "Final mark")
    if not marker.strip():
        raise ValueError("A marker name or identifier is required.")
    connection = open_database(database_path)
    try:
        with connection:
            # Lock before reading the previous mark so the audit trail stays accurate.
            connection.execute("BEGIN IMMEDIATE")
            answer = connection.execute(
                """SELECT a.final_mark, a.comment, q.max_mark, q.kind
                   FROM answers a JOIN questions q USING(question_id)
                   WHERE a.student_id = ? AND a.question_id = ?""",
                (student_id, question_id),
            ).fetchone()
            if answer is None:
                raise ValueError("Student/question pair was not found.")
            if answer["kind"] == "instruction":
                raise ValueError("Section instructions do not receive final marks.")
            if not Decimal(0) <= value <= Decimal(answer["max_mark"]):
                raise ValueError(f"Final mark must be between 0 and {answer['max_mark']}.")
            timestamp = utc_now()
            connection.execute(
                """UPDATE answers SET final_mark = ?, status = 'marked', comment = ?,
                   marked_by = ?, marked_at = ? WHERE student_id = ? AND question_id = ?""",
                (str(value), comment, marker, timestamp, student_id, question_id),
            )
            connection.execute(
                """INSERT INTO mark_history (student_id, question_id, previous_mark,
                   new_mark, previous_comment, new_comment, marker, changed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (student_id, question_id, answer["final_mark"], str(value),
                 answer["comment"], comment, marker, timestamp),
            )
    finally:
        connection.close()


def export_results(database_path: str | Path, output_path: str | Path,
                   *, allow_incomplete: bool = False) -> dict:
    """Export one row per student, using only human-recorded final marks.

    Missing marks remain blank. An incomplete student's total also stays blank
    so a partial sum cannot be mistaken for that student's final result.
    """
    output_path = Path(output_path)
    if output_path.suffix.lower() != ".csv":
        raise ValueError("Export filename must end in .csv.")
    if output_path.resolve() == Path(database_path).resolve():
        raise ValueError("Export must not overwrite the database.")
    connection = open_database(database_path)
    try:
        # Read a consistent snapshot even if another process saves marks during export.
        connection.execute("BEGIN")
        questions = connection.execute(
            "SELECT question_id FROM questions WHERE kind != 'instruction' ORDER BY position"
        ).fetchall()
        students = connection.execute("SELECT student_id FROM students ORDER BY source_record").fetchall()
        marks = {(r["student_id"], r["question_id"]): r["final_mark"] for r in
                 connection.execute("SELECT student_id, question_id, final_mark FROM answers")}
    finally:
        connection.close()
    if not students or not questions:
        raise ValueError("There are no student results to export.")
    question_ids = [q["question_id"] for q in questions]
    missing = {}
    for student in students:
        sid = student["student_id"]
        absent = [qid for qid in question_ids if marks.get((sid, qid)) is None]
        if absent:
            missing[sid] = absent
        # CSV quoting alone does not stop spreadsheets interpreting formulas.
        # Refuse unsafe identifiers instead of changing the student's real ID.
        if sid.lstrip().startswith(("=", "+", "-", "@")) or any(c in sid for c in "\r\n\t"):
            raise ValueError("A student ID is unsafe for spreadsheet export; review the source ID.")
    if missing and not allow_incomplete:
        raise IncompleteMarksError(missing)

    timestamp = utc_now()
    temp_path = None
    try:
        # Write next to the destination, then replace it only after a successful write.
        # A disk/write failure leaves any previous export intact.
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8-sig", newline="",
                                         dir=output_path.parent, delete=False) as stream:
            temp_path = Path(stream.name)
            writer = csv.writer(stream)
            writer.writerow(["student_id", *[f"question_{qid}_mark" for qid in question_ids],
                             "total_mark", "marking_complete", "missing_questions", "generated_at_utc"])
            for student in students:
                sid = student["student_id"]
                values = [marks.get((sid, qid)) for qid in question_ids]
                total = "" if sid in missing else str(sum((Decimal(v) for v in values), Decimal(0)))
                writer.writerow([sid, *[v if v is not None else "" for v in values], total,
                                 "no" if sid in missing else "yes", ";".join(missing.get(sid, [])), timestamp])
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_path, output_path)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
    return {"students_exported": len(students), "incomplete_students": len(missing),
            "generated_at_utc": timestamp, "output": str(output_path)}


def write_issue_report(path: str | Path, issues: list[Issue]) -> None:
    """JSON avoids turning diagnostic text into spreadsheet formulas."""
    Path(path).write_text(json.dumps([asdict(i) for i in issues], indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("validate", "import"):
        sub = commands.add_parser(name, help=f"{name.capitalize()} a Canvas quiz analysis CSV")
        sub.add_argument("csv_file")
        sub.add_argument("--config", help="JSON question-type/whitespace configuration")
        sub.add_argument("--report", help="Write validation issues to this JSON file")
        if name == "import":
            sub.add_argument("--db", required=True)
    mark = commands.add_parser("mark", help="Record a human-confirmed mark")
    mark.add_argument("--db", required=True)
    mark.add_argument("--student", required=True)
    mark.add_argument("--question", required=True)
    mark.add_argument("--mark", required=True)
    mark.add_argument("--marker", required=True)
    mark.add_argument("--comment", default="")
    export = commands.add_parser("export", help="Export recorded marks")
    export.add_argument("output")
    export.add_argument("--db", required=True)
    export.add_argument("--allow-incomplete", action="store_true")
    args = parser.parse_args()
    try:
        if args.command in {"validate", "import"}:
            config = load_config(args.config)
            if args.command == "validate":
                data = read_canvas_csv(args.csv_file, config)
            else:
                data = import_canvas_csv(args.csv_file, args.db, config)
            if args.report:
                write_issue_report(args.report, data.issues)
            print(json.dumps(data.summary(), indent=2))
            for issue in data.issues[:15]:
                print(f"{issue.severity.upper()} record {issue.record}, {issue.column}: {issue.message}")
            if len(data.issues) > 15:
                print("More issues exist. Use --report issues.json to see all locations.")
            return 1 if data.errors else 0
        if args.command == "mark":
            save_mark(args.db, args.student, args.question, args.mark, args.marker, args.comment)
            print("Human-confirmed mark saved.")
        elif args.command == "export":
            print(json.dumps(export_results(args.db, args.output, allow_incomplete=args.allow_incomplete), indent=2))
    except ValidationError as error:
        if args.report:
            write_issue_report(args.report, error.issues)
        print(str(error))
        for issue in error.issues[:15]:
            print(f"ERROR record {issue.record}, {issue.column}: {issue.message}")
        return 1
    except IncompleteMarksError as error:
        print(str(error))
        # These IDs are intentionally local: the coordinator needs to identify omissions.
        print(json.dumps({"missing_marks": error.missing}, indent=2))
        return 1
    except (ValueError, OSError, sqlite3.Error) as error:
        print(f"Error: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
