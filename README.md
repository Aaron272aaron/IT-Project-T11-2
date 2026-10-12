## Overview

This component helps the **Subject Coordinator** import student responses from a Canvas **Quiz Student Analysis Report** CSV file and export marks after tutors have reviewed and marked the responses. It is part of the larger AI-assisted programming exam marking application.

The current implementation is a **Python command-line prototype** backed by a local **SQLite** database. It does **not** itself provide a web interface, authenticate users, automatically grade answers, or run an AI model. Those are separate integration responsibilities.

## Current features

| Capability | Behaviour |
| --- | --- |
| Validate CSV | Checks the file extension, expected Canvas header layout, question/score column pairs, IDs, attempts, row widths, duplicate students, and score ranges. Reports errors and warnings. |
| Preserve answers | Retains original student responses, including code indentation and embedded line breaks. Stores a separate prepared value for short-answer questions. |
| Configurable preprocessing | Supports explicitly configured whitespace-character replacements and removal of trailing whitespace **for short answers only**. Code/function answers are not normalised. |
| Local storage | Imports validated questions, students, answers, and source scores into SQLite. An import is transactional and cannot overwrite an already-imported exam. |
| Human marking | Allows a mark (and an optional comment) to be recorded for a student/question, with mark-range validation and an audit-history entry. |
| Export results | Writes one CSV row per student with per-question marks, totals, completion status, missing-question IDs, and UTC export timestamp. Only human-recorded final marks are exported. |
| Incomplete results | Blocks the standard export when any required mark is missing; allows an explicitly requested partial export with incomplete totals left blank. |

**Note:** A Canvas-provided score is kept as source metadata; it is **not automatically accepted as the final mark**.

## Prerequisites

- **Python 3.10 or later** (the script uses modern Python type annotations).
- macOS, Linux, or another environment with Python and local filesystem access.
- **No third-party Python packages** are required; the code uses the standard library (`csv`, `sqlite3`, `argparse`, etc.).

Check Python on macOS:

```bash
python3 --version
```

## Sample CSV format

The parser targets the supplied **Canvas Quiz Student Analysis Report** layout, not arbitrary CSVs or a Canvas gradebook export. A simplified header is:

```csv
sis_id,id,attempt,1: Short answer,2.0,2: Executable code,3.0,3: Function question,5.0
```

- `sis_id`: student identifier selected by default (can be configured to use `id`).
- `id`: Canvas user identifier.
- `attempt`: positive integer.
- Each question-answer column has a header such as `1: Short answer`, immediately followed by a column whose header is that question's **maximum mark** (for example `2.0`).
- Quoted CSV fields may contain commas, tabs, indentation, and line breaks. Use a genuine CSV writer or a valid Canvas export when creating test files.

The parser also recognises a limited set of other Canvas metadata columns. Unexpected columns cause validation errors so that misidentified question columns are not silently discarded.

## Question-type configuration

Use a JSON configuration to identify the question types and any approved whitespace replacement rules:

```json
{
  "student_id_column": "sis_id",
  "question_types": {
    "1": "short_answer",
    "2": "executable_code",
    "3": "function"
  },
  "short_answer_whitespace": {
    "\u00a0": " "
  }
}
```

Supported types: `short_answer`, `executable_code`, `function`, `instruction`, `unclassified`.

The example replacement maps a **non-breaking space** to a normal space for short answers. Answers whose type is not configured are treated as `unclassified`, preserved unchanged, and reported with a warning. Review preprocessing rules against the marking rubric before enabling them; in particular, text such as `6` and `6.0` is **not** automatically treated as equivalent.

## Running the prototype

All commands below run from the project root. The sample CSV and configuration must be present there (or their paths must be adjusted).

### 1. Validate without importing

```bash
python3 "csv import.py" validate sample_canvas.csv \
  --config sample_config.json \
  --report issues.json
```

With the provided three-student synthetic sample, the expected summary is:

```json
{
  "students": 3,
  "questions_including_instructions": 3,
  "markable_questions": 3,
  "answer_records": 9,
  "errors": 0,
  "warnings": 1
}
```

The warning deliberately flags non-standard whitespace in the example; the original answer is retained. `issues.json` contains the locations and descriptions of validation issues. Record numbers refer to **CSV records**, not physical file lines (one quoted answer may span several lines).

### 2. Import into SQLite

```bash
python3 "csv import.py" import sample_canvas.csv \
  --config sample_config.json \
  --db sample_marking.db \
  --report import_issues.json
```

On success, the script prints the import summary and creates `sample_marking.db`. The SQLite schema includes `metadata`, `questions`, `students`, `answers`, and `mark_history`.

**One database contains one imported exam.** Importing another or corrected CSV into a populated database is rejected to protect existing marks. Use a **new database filename** for a separate test/import; do not delete a production marking database casually.

### 3. Record a human-confirmed mark

```bash
python3 "csv import.py" mark \
  --db sample_marking.db \
  --student 100001 \
  --question 1 \
  --mark 2 \
  --marker DemoMarker \
  --comment "Reviewed against rubric"
```

The mark must be within the maximum defined for the selected question. `--comment` is optional. The command records the updated mark and an audit-history entry in the database.

**The `--marker` value is an audit label, not a login mechanism.** When integrated into the web application, the backend must supply an authenticated marker identity and enforce coordinator/marker permissions.

### 4. Test incomplete-export protection

If some questions are not marked, this command **should fail as intended**:

```bash
python3 "csv import.py" export results.csv --db sample_marking.db
```

It reports which student/question marks are missing. For a deliberate partial export:

```bash
python3 "csv import.py" export partial_results.csv \
  --db sample_marking.db \
  --allow-incomplete
```

Unmarked question cells and incomplete student totals remain **blank**, not zero. The `marking_complete` column is `no` for those students.

### 5. Export complete results

Once a human marker has recorded a mark for **every markable question for every student**, run:

```bash
python3 "csv import.py" export results.csv --db sample_marking.db
```

The output columns follow this pattern:

```text
student_id,question_1_mark,question_2_mark,question_3_mark,total_mark,marking_complete,missing_questions,generated_at_utc
```

The output format is an **internal results CSV**. Any exact Canvas/Gradescope upload template needs to be confirmed and mapped before claiming direct compatibility.

## Using this module from the rest of the application

The important functions defined in `csv import.py` are:

| Function | Purpose |
| --- | --- |
| `read_canvas_csv(path, config=None)` | Return parsed `ImportData` with questions, students, issues, and a summary; does not save to the database. |
| `import_canvas_csv(csv_path, database_path, config=None)` | Validate and import into a local SQLite database; raises `ValidationError` for invalid content. |
| `save_mark(database_path, student_id, question_id, mark, marker, comment="")` | Store one human-entered final mark and audit entry. |
| `export_results(database_path, output_path, allow_incomplete=False)` | Write an export CSV; raises `IncompleteMarksError` unless a partial export is explicitly permitted. |

Because the source filename has a space, it is not convenient to import as a normal Python module. Renaming it to **`csv_import.py`** is recommended before integration (after coordinating imports with teammates).


## Scope and known limitations

- This is a **CLI/local storage component**, not the completed marking web application.
- It supports the expected **Quiz Student Analysis Report** CSV layout; other Canvas exports may require adjustments.
- The importer rejects duplicate/ambiguous students and does not offer an attempt-selection interface.
- The prototype enforces a **10,000-student-row limit** and a maximum CSV field size of **8 MiB**; performance under the full workload still requires measurement.
- Question grouping, automated execution of student code, local LLM fixes, user authentication, multi-marker locking, and application UI are **not implemented by this script**.
- SQLite storage here is **not encrypted** and the script does **not provide scheduled database backups or restore**. Security, access controls, and backup/recovery must be handled by the integrated system.
- A successful export is **not proof of direct Canvas/Gradescope import compatibility** without a separately agreed target format.
