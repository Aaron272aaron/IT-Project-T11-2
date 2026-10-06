"""Adapt the existing CSV module to the web preview without opening SQLite."""

import importlib.util
import math
import sys
import tempfile
from pathlib import Path


# The teammate's filename contains a space, so load it by its fixed local path.
# Register it before execution because dataclasses look up their module by name.
MODULE_PATH = Path(__file__).resolve().parent.parent / "csv import.py"
spec = importlib.util.spec_from_file_location("automarktic_canvas_import", MODULE_PATH)
csv_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = csv_module
spec.loader.exec_module(csv_module)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def preview_csv(content: bytes) -> dict:
    """Read original bytes with the teammate's parser and return UI field names."""
    # The existing parser takes a path. Use a private, generated temporary path,
    # never a browser-supplied filename. Clean it up even if parsing raises.
    with tempfile.TemporaryDirectory(prefix="automarktic-csv-") as directory:
        path = Path(directory) / "upload.csv"
        path.write_bytes(content)
        data = csv_module.read_canvas_csv(path)

    issues = [
        {"severity": i.severity, "record": i.record,
         "field": i.column, "message": i.message}
        for i in data.issues
    ]
    # Decimal accepts values beyond JavaScript's numeric range. Report these
    # rather than emitting Infinity, which is not a valid JSON number.
    for q in data.questions:
        if not math.isfinite(float(q.max_mark)):
            issues.append({"severity": "error", "record": 1,
                           "field": q.question_id,
                           "message": "Question maximum is too large for the web preview."})
    invalid = any(i["severity"] == "error" for i in issues)
    preview = {"questions": [], "students": [], "issues": issues}
    # Do not expose a partial answer preview when any record is invalid.
    if not invalid:
        preview["questions"] = [
            {"id": q.question_id, "text": q.text, "maxMark": float(q.max_mark),
             "instruction": q.kind == "instruction", "column": q.answer_column}
            for q in data.questions
        ]
        preview["students"] = [
            {"id": s["student_id"], "canvasId": s["canvas_id"],
             "attempt": s["attempt"], "answers": [
                 {"questionId": a["question_id"],
                  "original": a["original_answer"],
                  "sourceScore": a["source_score"],
                  "blank": "blank_answer" in a["review_flags"],
                  "unicodeReview": "unicode_formatting_review" in a["review_flags"]}
                 for a in s["answers"]]}
            for s in data.students
        ]
    # Source scores remain metadata; the adapter assigns no final marks.
    return {"status": "invalid" if invalid else "ok",
            "service": "automarktic-python", "parser": "csv import.py",
            "preview": preview}
