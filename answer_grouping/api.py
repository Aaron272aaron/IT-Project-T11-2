"""Framework-neutral JSON adapter; use behind an authenticated HTTP endpoint."""
from __future__ import annotations
from .core import GroupingOptions, Submission, group_answers


def handle_grouping_request(payload: dict) -> dict:
    """Accept {'answers': [{submission_id, student_id, question_id, answer}]}.

    Unsupported fields are rejected rather than silently ignored.
    """
    if not isinstance(payload, dict) or set(payload) != {"answers"}:
        raise ValueError("request must contain only an 'answers' field")
    raw = payload["answers"]
    if not isinstance(raw, list):
        raise ValueError("answers must be an array")
    if len(raw) > 10_000:
        raise ValueError("no more than 10000 submissions per request")
    submissions = []
    required = {"submission_id", "student_id", "question_id", "answer"}
    for row in raw:
        if not isinstance(row, dict) or set(row) != required:
            raise ValueError("each answer must have exactly submission_id, student_id, question_id, answer")
        submissions.append(Submission(**row))
    groups = group_answers(submissions)
    return {"schema_version": 1, "group_count": len(groups), "submission_count": len(submissions), "groups": groups,
            "bar_chart": [{"group_id": group["group_id"], "count": group["count"]} for group in groups]}
