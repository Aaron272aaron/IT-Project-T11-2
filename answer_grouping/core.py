
"""Group short-answer submissions using syntax-aware Python normalisation.

Answers with insignificant formatting differences are grouped together.
Meaningful differences in Python syntax are preserved.

Student code is never executed, and original answers are never modified.
"""

from __future__ import annotations

import ast
import hashlib
import io
import json
import tokenize

from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class Submission:
    """Store one student's answer to one question."""

    submission_id: str
    student_id: str
    question_id: str
    answer: str


@dataclass(frozen=True)
class GroupingOptions:
    """Settings for grouping student answers.

    Kept for compatibility with the existing grouping interface.
    Syntax-aware normalisation determines which whitespace is ignored.
    """

    extra_whitespace: str = ""

    def __post_init__(self) -> None:
        if any(not char.isspace() for char in self.extra_whitespace):
            raise ValueError(
                "extra_whitespace must contain only whitespace characters"
            )


def grouping_key(
    answer: str,
    options: GroupingOptions | None = None
) -> str:
    """Create a syntax-aware key for comparing Python answers.

    Ignore insignificant whitespace between Python tokens.

    Preserve:
    - Variable names and capitalisation
    - String literal contents
    - Numbers and operators
    - Comments
    - Indentation structure
    - Statement boundaries
    - Parentheses and punctuation

    Invalid or incomplete Python answers are preserved exactly.
    Student code is never executed.

    The options parameter is retained for interface compatibility.
    """
    if not isinstance(answer, str):
        raise TypeError("answer must be a string")

    # Check whether the answer is valid standalone Python.
    # This only parses code; it does not execute anything.
    try:
        ast.parse(answer)
    except (SyntaxError, ValueError):
        return "raw:" + answer

    tokens = []

    try:
        # Break Python code into tokens.
        token_stream = tokenize.generate_tokens(
            io.StringIO(answer).readline
        )

        for token in token_stream:
            token_type = token.type
            token_value = token.string

            # Ignore non-significant newlines and the end marker.
            if token_type in (
                tokenize.NL,
                tokenize.ENDMARKER
            ):
                continue

            # Preserve indentation structure, but not exact width.
            if token_type in (
                tokenize.INDENT,
                tokenize.DEDENT
            ):
                tokens.append((token_type, ""))

            # Preserve significant statement-ending newlines.
            elif token_type == tokenize.NEWLINE:
                tokens.append((token_type, ""))

            # Preserve the type and exact value of other tokens.
            else:
                tokens.append((token_type, token_value))

    except (tokenize.TokenError, IndentationError):
        return "raw:" + answer

    # Convert the token sequence into a stable string key.
    return "tokens:" + json.dumps(
        tokens,
        ensure_ascii=False
    )


def group_answers(
    submissions: Iterable[Submission],
    options: GroupingOptions | None = None
) -> list[dict]:
    """Group student answers with matching syntax-aware keys.

    All submissions must belong to the same question.

    Groups are returned largest first. Group IDs are generated
    from the question ID and grouping key, so they do not depend
    on the order in which submissions are received.

    Original student answers are preserved.
    """
    options = options or GroupingOptions()

    # Store submissions according to their grouping keys.
    buckets: dict[str, list[Submission]] = defaultdict(list)

    # Track submission IDs to detect duplicates.
    seen_ids: set[str] = set()

    # All submissions must belong to one question.
    question_id: str | None = None

    for item in submissions:

        # Check that each item is a Submission object.
        if not isinstance(item, Submission):
            raise TypeError("each item must be a Submission")

        # Check that every field contains a string.
        if not all(
            isinstance(field, str)
            for field in (
                item.submission_id,
                item.student_id,
                item.question_id,
                item.answer
            )
        ):
            raise TypeError("submission fields must be strings")

        # Check that required identifiers are not empty.
        if (
            not item.submission_id
            or not item.student_id
            or not item.question_id
        ):
            raise ValueError(
                "submission_id, student_id, question_id must be nonempty"
            )

        # Reject duplicate submission IDs.
        if item.submission_id in seen_ids:
            raise ValueError(
                f"duplicate submission ID: {item.submission_id}"
            )

        seen_ids.add(item.submission_id)

        # Ensure every submission is for the same question.
        if question_id is None:
            question_id = item.question_id

        elif question_id != item.question_id:
            raise ValueError(
                "submissions must belong to the same question"
            )

        # Generate the syntax-aware grouping key.
        key = grouping_key(item.answer, options)

        # Add the original submission to its group.
        buckets[key].append(item)

    # Build the final list of groups.
    result = []

    for key, members in buckets.items():

        # Sort students by submission ID for stable output.
        members.sort(
            key=lambda member: member.submission_id
        )

        # Generate a stable group ID.
        digest = hashlib.sha256(
            (question_id + "\0" + key).encode("utf-8")
        ).hexdigest()[:20]

        result.append({
            "group_id": f"group-{digest}",

            # Representative original answer.
            "answer": members[0].answer,

            # Number of submissions in the group.
            "count": len(members),

            # All students and their original answers.
            "students": [
                {
                    "submission_id": member.submission_id,
                    "student_id": member.student_id,
                    "answer": member.answer,
                }
                for member in members
            ],
        })

    # Sort by group size, largest first.
    # Use group ID to break ties consistently.
    result.sort(
        key=lambda group: (
            -group["count"],
            group["group_id"]
        )
    )

    return result
