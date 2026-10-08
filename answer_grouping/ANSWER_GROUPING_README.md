# Answer grouping (FR2.1–FR2.5)

Standalone Python backend module with no third-party dependencies. **Student code is never executed.**

## Grouping behaviour

Syntax-aware Python normalisation is the **only** grouping mode. A tutor does not need to configure a whitespace mode.

- Answers must parse as standalone Python source for syntax-aware grouping.
- For valid Python, compare token types and values; ignore whitespace between tokens, non-significant newlines, and indentation *width*, while preserving indentation *structure*, statement boundaries, string values, comments, case, operators, and punctuation.
- Invalid or incomplete Python source is compared **exactly**, including whitespace.
- No AST-equivalence, fuzzy matching, execution, or correctness checking is performed. Token equality is not a proof of equivalent runtime behaviour.
- Student answers are always kept in their original form.
- Group IDs are stable for the same question and grouping key. Changing the normalisation algorithm changes group IDs; do not silently reuse old group-level marks.

**Requirements note:** This replaces the old FR2.1 ASCII-space-only grouping and removes the optional extra-whitespace configuration (former FR2.3). Confirm the altered requirement with the team before merging.

## Usage

From the directory containing `answer_grouping/`:

```bash
python -m unittest discover -s tests -v
```

```python
from answer_grouping import handle_grouping_request

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

`tests/test_answer_grouping.py` covers normalisation, meaningful token differences, malformed input, stable ordering, API output, explicit marking, and 10,000 submissions. An integrated API/database test is still needed.
