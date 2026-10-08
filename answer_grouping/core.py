"""Deterministic grouping of short-answer responses (FR2.1–FR2.3).

Grouping never runs submitted code and never changes the stored original answer.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import hashlib
from typing import Iterable


@dataclass(frozen=True)
class Submission:
    """One submission for one short-answer question."""

    submission_id: str
    student_id: str
    question_id: str
    answer: str


@dataclass(frozen=True)
class GroupingOptions:
    """Optional extra whitespace characters approved for removal by the tutor.

    By default only ASCII space U+0020 is removed (FR2.1). Character removal
    other than whitespace is prohibited here to preserve programming meaning.
    """

    extra_whitespace: str = ""

    def __post_init__(self) -> None:
        if any(not char.isspace() for char in self.extra_whitespace):
            raise ValueError("extra_whitespace must contain only whitespace characters")


def grouping_key(answer: str, options: GroupingOptions | None = None) -> str:
    """Ignore ASCII spaces; preserve case, punctuation and all other characters."""
    if not isinstance(answer, str):
        raise TypeError("answer must be a string")
    options = options or GroupingOptions()
    ignored = {" ", *options.extra_whitespace}
    return "".join(character for character in answer if character not in ignored)


def group_answers(
    submissions: Iterable[Submission], options: GroupingOptions | None = None
) -> list[dict]:
    """Return stable, JSON-ready answer groups, largest first.

    Input submissions must belong to the same question. No marking happens here.
    Group IDs depend only on question ID and normalized text, not input ordering.
    """
    options = options or GroupingOptions()
    buckets: dict[str, list[Submission]] = defaultdict(list)
    seen_ids: set[str] = set()
    question_id: str | None = None
    for item in submissions:
        if not isinstance(item, Submission):
            raise TypeError("each item must be a Submission")
        if not all(isinstance(field, str) for field in (
            item.submission_id, item.student_id, item.question_id, item.answer
        )):
            raise TypeError("submission fields must be strings")
        if not item.submission_id or not item.student_id or not item.question_id:
            raise ValueError("submission_id, student_id, question_id must be nonempty")
        if item.submission_id in seen_ids:
            raise ValueError(f"duplicate submission ID: {item.submission_id}")
        seen_ids.add(item.submission_id)
        if question_id is None:
            question_id = item.question_id
        elif question_id != item.question_id:
            raise ValueError("submissions must belong to the same question")
        buckets[grouping_key(item.answer, options)].append(item)

    result = []
    for key, members in buckets.items():
        members.sort(key=lambda member: member.submission_id)
        digest = hashlib.sha256((question_id + "\0" + key).encode("utf-8")).hexdigest()[:20]
        result.append({
            "group_id": f"group-{digest}",
            "answer": members[0].answer,
            "count": len(members),
            "students": [{
                "submission_id": member.submission_id,
                "student_id": member.student_id,
                "answer": member.answer,
            } for member in members],
        })
    result.sort(key=lambda group: (-group["count"], group["group_id"]))
    return result
