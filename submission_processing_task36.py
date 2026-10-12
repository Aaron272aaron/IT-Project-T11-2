"""Task 36: Submission-processing service for the local exam-marking project.

Reuses Task 35's Canvas CSV parser and SQLite schema; DOES NOT implement a
second parser, mark assignment, answer grouping, code execution or AI marking.

Requires csv_import_task35.py from Task 35 in the same Python directory.
All operations use local files. Subject Coordinator authorization must be
implemented by the calling web application, not by this command-line prototype.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Any

from csv_import_task35 import (
    ValidationError,
    import_canvas_csv,
    load_config,
    open_database,
    read_canvas_csv,
    read_rubric_catalog, match_rubric, resolve_question_id,
)


REVIEW_FLAGS = {"blank_answer", "unicode_formatting_review"}


def preview_import(csv_path: str | Path, config: dict | None = None) -> dict[str, Any]:
    """Validate an import without writing to the database or logging answers."""
    data = read_canvas_csv(csv_path, config)
    return {
        "valid": not bool(data.errors),
        "summary": data.summary(),
        "issues": [
            {
                "severity": issue.severity,
                "record": issue.record,
                "column": issue.column,
                "message": issue.message,
            }
            for issue in data.issues
        ],
    }


def load_submissions(
    csv_path: str | Path, database_path: str | Path, config: dict | None = None,
    *, rubric: dict | None = None
) -> dict[str, Any]:
    """Validate and atomically store one Canvas exam via the Task 35 importer.

    Raises ValidationError and leaves an existing imported database untouched
    if the incoming file fails validation. This function does NOT authenticate
    the user; the calling web application must enforce coordinator-only import.
    """
    data = import_canvas_csv(csv_path, database_path, config, rubric=rubric)
    return {"database": str(database_path), **data.summary()}


def _read_flags(encoded: str) -> list[str]:
    flags = json.loads(encoded)
    if not isinstance(flags, list) or not all(isinstance(v, str) for v in flags):
        raise ValueError("Stored review flags have an invalid structure.")
    return flags


def _answer_record(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "student_id": row["student_id"],
        "question_id": row["question_id"],
        "question_label": row["display_label"],
        "question_text": row["question_text"],
        "question_type": row["kind"],
        "original_answer": row["original_answer"],
        "prepared_answer": row["prepared_answer"],
        "marking_status": row["status"],
        "review_flags": _read_flags(row["review_flags"]),
        "final_mark": row["final_mark"],
        # Source Canvas score is IMPORT METADATA, not a human-confirmed mark.
        "canvas_score_metadata": row["source_score"],
    }


_QUERY_BASE = """
    SELECT a.student_id, a.question_id, q.question_text, q.kind,
           (CASE WHEN q.kind='instruction' THEN NULL ELSE
             'Q' || (SELECT COUNT(*) FROM questions q2
                     WHERE q2.kind!='instruction' AND q2.position<=q.position)
            END) AS display_label,
           a.original_answer, a.prepared_answer, a.status, a.review_flags,
           a.final_mark, a.source_score
    FROM answers AS a
    JOIN questions AS q ON q.question_id = a.question_id
    JOIN students AS s ON s.student_id = a.student_id
"""


def submissions_for_question(db_path: str | Path, question_id: str) -> list[dict[str, Any]]:
    """Answer records for a question, in the original Canvas student order."""
    conn = open_database(db_path)
    try:
        question_id=resolve_question_id(conn,question_id)
        found = conn.execute("SELECT 1 FROM questions WHERE question_id = ?", (question_id,)).fetchone()
        if found is None:
            raise ValueError(f"Unknown question ID: {question_id}")
        rows = conn.execute(
            _QUERY_BASE + " WHERE a.question_id = ? ORDER BY s.source_record",
            (question_id,),
        ).fetchall()
        return [_answer_record(row) for row in rows]
    finally:
        conn.close()


def submissions_for_student(db_path: str | Path, student_id: str) -> list[dict[str, Any]]:
    """Answer records for a student, in the original exam-question order."""
    conn = open_database(db_path)
    try:
        found = conn.execute("SELECT 1 FROM students WHERE student_id = ?", (student_id,)).fetchone()
        if found is None:
            raise ValueError(f"Unknown student ID: {student_id}")
        rows = conn.execute(
            _QUERY_BASE + " WHERE a.student_id = ? ORDER BY q.position",
            (student_id,),
        ).fetchall()
        return [_answer_record(row) for row in rows]
    finally:
        conn.close()


def processing_summary(db_path: str | Path) -> dict[str, Any]:
    """Return counts without returning any student's submitted answer text."""
    conn = open_database(db_path)
    try:
        student_count = conn.execute("SELECT COUNT(*) FROM students").fetchone()[0]
        question_count = conn.execute(
            "SELECT COUNT(*) FROM questions WHERE kind != 'instruction'"
        ).fetchone()[0]
        status_rows = conn.execute(
            "SELECT a.status, COUNT(*) AS count FROM answers a "
            "JOIN questions q ON q.question_id = a.question_id "
            "WHERE q.kind != 'instruction' GROUP BY a.status"
        ).fetchall()
        return {
            "students": student_count,
            "markable_questions": question_count,
            "answer_records": sum(row["count"] for row in status_rows),
            "marking_status_counts": {row["status"]: row["count"] for row in status_rows},
        }
    finally:
        conn.close()


def submissions_needing_review(db_path: str | Path) -> list[dict[str, Any]]:
    """List flagged records; avoid copying full student answers into logs."""
    conn = open_database(db_path)
    try:
        rows = conn.execute(
            "SELECT a.student_id, a.question_id, a.review_flags "
            "FROM answers a JOIN students s ON s.student_id = a.student_id "
            "JOIN questions q ON q.question_id = a.question_id "
            "WHERE q.kind != 'instruction' ORDER BY s.source_record, q.position"
        ).fetchall()
        results = []
        for row in rows:
            flags = [f for f in _read_flags(row["review_flags"]) if f in REVIEW_FLAGS]
            if flags:
                results.append({
                    "student_id": row["student_id"],
                    "question_id": row["question_id"],
        "question_label": row["display_label"],
                    "review_flags": flags,
                })
        return results
    finally:
        conn.close()


def question_rubric_info(db_path: str | Path, question_reference: str) -> dict[str, Any]:
    """Return rubric options without student answer data."""
    con = open_database(db_path)
    try:
        qid = resolve_question_id(con,question_reference)
        item = con.execute("SELECT question_id,question_text,max_mark,kind FROM questions WHERE question_id=?",(qid,)).fetchone()
        if not item: raise ValueError('Unknown question reference.')
        saved = con.execute("SELECT value FROM metadata WHERE key='rubric_map'").fetchone()
        rubric = json.loads(saved[0]) if saved else {}
        return {'canvas_question_id':qid,'question_text':item['question_text'],
                'max_mark':item['max_mark'], 'question_type':item['kind'],
                'rubric':rubric.get(qid)}
    finally:
        con.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    preview = sub.add_parser("preview", help="Validate a Canvas file before import")
    preview.add_argument("csv_file")
    preview.add_argument("--config", help="Optional question-type/whitespace JSON configuration")

    load = sub.add_parser("load", help="Import a validated exam into a NEW local SQLite database")
    load.add_argument("csv_file")
    load.add_argument("--config")
    load.add_argument("--db", required=True)
    load.add_argument("--rubric", help="Reviewed JSON rubric catalogue")

    summary = sub.add_parser("summary", help="Show counts and saved marking statuses")
    summary.add_argument("--db", required=True)

    by_question = sub.add_parser("question", help="View submissions for one question")
    by_question.add_argument("--db", required=True)
    by_question.add_argument("--id", required=True, help="Question ID")
    by_question.add_argument("--limit", type=int, default=20)

    by_student = sub.add_parser("student", help="View a student's question-by-question submissions")
    by_student.add_argument("--db", required=True)
    by_student.add_argument("--id", required=True, help="Student ID")

    review = sub.add_parser("review", help="List records flagged for human review")
    review.add_argument("--db", required=True)

    question_rubric = sub.add_parser("rubric", help="Display rubric options for Canvas ID or Q1..Q37")
    question_rubric.add_argument("--db", required=True)
    question_rubric.add_argument("--id", required=True)

    args = parser.parse_args()
    try:
        if args.command == "preview":
            output = preview_import(args.csv_file, load_config(args.config))
            success = output["valid"]
        elif args.command == "load":
            rubric = read_rubric_catalog(args.rubric) if args.rubric else None
            output = load_submissions(args.csv_file, args.db, load_config(args.config), rubric=rubric)
            success = True
        elif args.command == "rubric":
            output = question_rubric_info(args.db, args.id)
            success = True
        elif args.command == "summary":
            output = processing_summary(args.db)
            success = True
        elif args.command == "question":
            if args.limit < 1:
                raise ValueError("--limit must be a positive integer.")
            records = submissions_for_question(args.db, args.id)
            output = {"total": len(records), "shown": min(len(records), args.limit),
                      "submissions": records[:args.limit]}
            success = True
        elif args.command == "student":
            output = submissions_for_student(args.db, args.id)
            success = True
        else:
            output = submissions_needing_review(args.db)
            success = True
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 0 if success else 1
    except ValidationError as error:
        print(json.dumps({"error": str(error), "issues": [vars(i) for i in error.issues]}, indent=2))
    except (ValueError, OSError, sqlite3.Error, json.JSONDecodeError) as error:
        print(f"Error: {error}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
