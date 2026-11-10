# Answer grouping (FR2.1–FR2.5)

Standalone Python backend module with no third-party dependencies. **Student code is never executed.**

## Grouping behaviour

The web app uses **spaces-only short-answer grouping** to match the live Confluence FR2.1 requirement. Python callers retain syntax-aware grouping by default. Select `mode="spaces"` explicitly for short answers; pass approved `unicode_spaces` for optional space replacements. Select `mode="exact"` for expression outputs to preserve every character, including spaces inside output strings. Originals are never edited.

- Answers must parse as standalone Python source for syntax-aware grouping.
- For valid Python, compare token types and values; ignore whitespace between tokens, non-significant newlines, and indentation *width*, while preserving indentation *structure*, statement boundaries, string values, comments, case, operators, and punctuation.
- Invalid or incomplete Python source is compared **exactly**, including whitespace.
- No AST-equivalence, fuzzy matching, execution, or correctness checking is performed. Token equality is not a proof of equivalent runtime behaviour.
- Student answers are always kept in their original form.
- Group IDs are stable for the same question and grouping key. Changing the normalisation algorithm changes group IDs; do not silently reuse old group-level marks.

**Requirements note:** Spaces-only mode ignores ASCII U+0020 and explicitly approved Unicode spaces. It preserves punctuation, case, tabs and line breaks. Syntax-aware mode remains unchanged and is not applied to function/code questions by the grouping UI. See [integration and live requirement mapping](INTEGRATION.md).

## Usage

From the project root containing `auto_marking/answer_grouping/`:

```bash
python -m unittest discover -s backend/tests -p 'test_answer_grouping.py' -v
```

```python
from auto_marking.answer_grouping import handle_grouping_request

result = handle_grouping_request({"answers": [
    {"submission_id": "sub1", "student_id": "student1", "question_id": "Q1", "answer": "a + b"},
    {"submission_id": "sub2", "student_id": "student2", "question_id": "Q1", "answer": "a+b"},
]})
print(result)
```

## API and integration

The API request has exactly one top-level field, `answers`, containing at most 10,000 objects, each with exactly `submission_id`, `student_id`, `question_id`, `answer` (all strings). Only one question per request.

The response has `schema_version`, `group_count`, `submission_count`, `groups`, and `bar_chart` fields. The frontend renders the chart; the module does not create a web server, UI, or database.

`mark_group()` and `mark_student()` prepare **proposed** mark updates only after explicit tutor invocation. The integrating backend must enforce authentication, membership, question maxima, concurrent edits, persistence, and audit logging. Submissions and group results contain student identifiers and belong in an authorised environment.

## Tests

`backend/tests/test_answer_grouping.py` covers normalisation, meaningful differences, stable ordering, 10,000 submissions and the real HTTP boundary. Frontend unit and browser tests cover group confirmation, individual override, rule approval, persistence and large-cohort navigation. Shared database integration is still separate work.
