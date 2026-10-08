# Answer grouping (FR2.1–FR2.5)

Standalone Python backend module. No third-party dependencies and **no student code execution**.

## Scope
- FR2.1: Group equal short answers after ignoring **ASCII spaces** only. Do not discard tabs, newlines, operators, punctuation or letter case.
- FR2.2: Group detail data (original answer and member student IDs) and graph-ready count data. Rendering the actual bar chart belongs to the frontend branch.
- FR2.3 (optional): `GroupingOptions(extra_whitespace="\u00a0")` allows a tutor-approved list of additional whitespace characters in the Python core. The public adapter does not expose it until team-defined authorization/approval is designed.
- FR2.4–FR2.5: `mark_group` and `mark_student` produce validated **proposed** database updates only after explicit tutor invocation. They do not write to storage or mark automatically.

## Usage
Run from the directory containing `answer_grouping/`:

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

## Integration contracts
The import/database teammate supplies one record per submission with distinct `submission_id`, `student_id`, `question_id` and original `answer` (all strings). Only send answers from **one short-answer question** per call. Do not group function/code-test questions. The API teammate should call `handle_grouping_request` from a locally authenticated backend route, returning its JSON result. Map `bar_chart` counts to bars and `groups[].students` to a selected group's detail view. The marking teammate should persist explicit `mark_group` or `mark_student` results atomically, enforcing auth, group membership, question maximum marks, concurrent edits and audit logging in the DB/backend. Grouping output contains student identifiers and must remain in the authorized local environment.

**Important:** No endpoint, database schema or UI is claimed as implemented here. Those are integration responsibilities for the relevant branches.

## Test strategy
Unit and boundary tests cover whitespace, punctuation, case, Unicode, stable ordering, malformed input, duplicate IDs, marking constraints and 10,000 submissions. An end-to-end test is needed when the API and DB are integrated. Requirement traceability: `tests/test_answer_grouping.py`.
