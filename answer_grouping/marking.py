"""Explicit tutor-controlled marking operations for FR2.4 and FR2.5.

This module prepares mark updates; persistence, authentication, audit logging,
and concurrent-write protection must be implemented by the integrating backend.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation


def _validated_mark(mark: str | int | float | Decimal, maximum: str | int | float | Decimal) -> str:
    try:
        value, upper = Decimal(str(mark)), Decimal(str(maximum))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("mark and maximum must be numeric") from exc
    if not value.is_finite() or not upper.is_finite() or upper < 0 or not (0 <= value <= upper):
        raise ValueError("mark must be between zero and the question maximum")
    return str(value)


def mark_group(group: dict, mark: str | int | float | Decimal, maximum: str | int | float | Decimal) -> list[dict]:
    """Produce one mark update for each submission in an explicitly selected group."""
    validated = _validated_mark(mark, maximum)
    if not isinstance(group, dict) or not isinstance(group.get("students"), list):
        raise ValueError("invalid group")
    ids = [member["submission_id"] for member in group["students"]]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate submission IDs in group")
    return [{"submission_id": identifier, "final_mark": validated} for identifier in ids]


def mark_student(submission_id: str, mark: str | int | float | Decimal, maximum: str | int | float | Decimal) -> dict:
    """Produce an update for one student only; call after tutor confirmation."""
    if not isinstance(submission_id, str) or not submission_id:
        raise ValueError("submission_id must be nonempty")
    return {"submission_id": submission_id, "final_mark": _validated_mark(mark, maximum)}
