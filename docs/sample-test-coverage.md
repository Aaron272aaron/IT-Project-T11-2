# Sample exam test coverage

All 37 sample questions have a reviewed test or human-review plan. There are **117 checks across 27 automated suites**; **10 questions require human review**. Tests provide evidence and never assign final marks.

The sources are the supplied [Canvas CSV](../data/samples/COMP10001%202025%20Exam%20%28only%20relevant%20for%20T01_11%29%20Quiz%20Student%20Analysis%20Report.csv) and [DOCX marking guide](../data/samples/final-2025s1-marking-rubric%20%28guide%29%20to%20be%20updated.docx), Parts 1–7. The source documents and existing student answers were preserved.

## Coverage by question

| Question | Type | Checks | Behavior |
| --- | --- | ---: | --- |
| Q1 | expression-output | 2 | Compare literal value and type separately; preserve original answer. |
| Q2 | expression-output | 2 | Compare literal value and type separately; preserve original answer. |
| Q3 | expression-output | 2 | Compare literal value and type separately; preserve original answer. |
| Q4 | expression-output | 2 | Compare literal value and type separately; preserve original answer. |
| Q5 | expression-output | 2 | Compare literal value and type separately; preserve original answer. |
| Q6 | expression-output | 2 | Compare literal value and type separately; preserve original answer. |
| Q7 | expression-output | 2 | Compare literal value and type separately; preserve original answer. |
| Q8 | expression-output | 2 | Compare literal value and type separately; preserve original answer. |
| Q9 | expression-output | 2 | Compare literal value and type separately; preserve original answer. |
| Q10 | assignment-statement | 7 | Execute with input contexts and check the one-assignment requirement. |
| Q11 | assignment-statement | 7 | Execute with input contexts and check the one-assignment requirement. |
| Q12 | assignment-statement | 7 | Execute with input contexts and check the one-assignment requirement. |
| Q13 | assignment-statement | 8 | Execute with input contexts and check the one-assignment requirement. |
| Q14 | multiple-choice | Human review | The supplied CSV omits the choices and the rubric supplies no option answer key. Review the original Canvas result; do not infer a key from student answers. |
| Q15 | multiple-choice | Human review | The supplied CSV omits the choices and the rubric supplies no option answer key. Review the original Canvas result; do not infer a key from student answers. |
| Q16 | multiple-choice | Human review | The supplied CSV omits the choices and the rubric supplies no option answer key. Review the original Canvas result; do not infer a key from student answers. |
| Q17 | multiple-choice | Human review | The supplied CSV omits the choices and the rubric supplies no option answer key. Review the original Canvas result; do not infer a key from student answers. |
| Q18 | code-completion | 8 | Insert the missing line into its function; test behavior and syntax. |
| Q19 | code-completion | 8 | Insert the missing line into its function; test behavior and syntax. |
| Q20 | code-completion | 8 | Insert the missing line into its function; test behavior and syntax. |
| Q21 | code-completion | 8 | Insert the missing line into its function; test behavior and syntax. |
| Q22 | code-completion | 8 | Insert the missing line into its function; test behavior and syntax. |
| Q23 | debugging | 2 | Compare literal value and type separately; preserve original answer. |
| Q24 | debugging | 2 | Compare literal value and type separately; preserve original answer. |
| Q25 | debugging | 2 | Compare literal value and type separately; preserve original answer. |
| Q26 | debugging | 2 | Compare literal value and type separately; preserve original answer. |
| Q27 | debugging | Human review | The answer identifies an original line and a replacement, often in prose. Compare both with the rubric; a code-only runner cannot assess that explanation fairly. |
| Q28 | debugging | 1 | Check whether the supplied call exposes a further bug after the slicing fix. |
| Q29 | debugging | Human review | This trace depends on the student's own Q28 example. The runner must not assume a fixed call or ignore the required type/explanation. |
| Q30 | debugging | Human review | Either remaining error can be fixed, depending on Q28–29. A prose line-and-replacement answer needs contextual review. |
| Q31 | debugging | Human review | This asks for the other error in one sentence, depending on the student's earlier choices. No deterministic code test can assess the explanation. |
| Q32 | coding | 6 | Run function cases against expected behavior; no grading marks. |
| Q33 | coding | 7 | Run function cases against expected behavior; no grading marks. |
| Q34 | coding | 7 | Run function cases against expected behavior; no grading marks. |
| Q35 | short-answer | Human review | This explanation and relevant hiring example require human rubric judgment. Keyword presence is not evidence of a correct argument. |
| Q36 | short-answer | 1 | Compare the recursive output; accept quoted or unquoted digits. |
| Q37 | short-answer | Human review | The suitability and explanation of Monte Carlo simulation require human rubric judgment; multiple examples can be valid. |

## Using the app

Start both services with `npm run dev` in `frontend/`, enter the demo or a real account, open a Sample exam question and select a student's **Mark** button. The **Answer checks and test results** panel contains:

- **Check original answer** for outputs, literal traces, the Q28 counterexample and Q36.
- **Run original tests** for assignments, missing-code lines and functions.
- **Human review required** plus a checklist where an automatic result would be unreliable.

Executable code and answer checks use the same isolated Docker runner. Valid-looking literal outputs are parsed with `ast.literal_eval`, never executed as expressions. Code-completion snippets receive trusted surrounding code; that assembled code exists only in the runner. Tests do not replace the student's original code or change any mark. Blank answers remain available for manual marking.

## Cases and limits

Q10–13 include empty inputs, absent/present zero, repeated ASCII spaces, preserved tabs/Unicode spaces, integer and tuple dictionary keys, uppercase vowels and punctuation. Value equality and type are checked separately where the rubric distinguishes them. Multiple assignments may produce correct values but fail the single-assignment check, leaving the rubric's partial-credit decision to the marker.

Q18–22 cover queries missing from the list, queries first/last in the list, negative numbers, and previous values greater than the query. Other missing lines are supplied from the reference; the submitted line is preserved as received and inserted at its intended indentation.

Q32 keeps its six existing cases. Q33 adds both examples, ties where the first encountered letter is not the alphabetical winner, all-equal letters, late-row winners and rectangular boards. Q34 adds both examples, tied optimal outputs, smallest boards, edges and diagonal traps. Every optimal tied word in the configured cases is accepted; no single arbitrary reference spelling is required. The text does not explicitly state a tile-reuse policy, so the cases do not enforce one; their optimal score is identical with or without reuse.

Q14–17 cannot be rerun from the supplied materials: choice options and the correct option sets are absent. Source Canvas scores are retained as source data. Q27 and Q29–31 depend on prose, named replacement lines or the student's linked Q28 response; their checklists explicitly require contextual review. Q35 and Q37 require reasoning/examples and are not judged by keywords.

## Source discrepancies

- **Q4:** the CSV omits `&`; the DOCX explicitly supplies set intersection. The check uses `{3}` and the app identifies the DOCX as the reference. The original CSV question is unchanged.
- **Q13:** the example solution omits case-insensitive matching. Tests follow the question wording and include uppercase vowels.
- **Q28:** the DOCX offers an empty-word-list example, but the shown original function already returns `None` on an empty list. That example does not expose either further bug. The counterexample check isolates the two further bugs after correcting the Q27 slice; Q29 still requires tracing the student's original example in its actual context.
- **Q32:** the example solution counts all tiles instead of occurrences of `char`. The cases follow the explicit question and its worked examples.
- **Q34:** the sample solution includes diagonals, while the question explicitly excludes them. Cases use horizontal/vertical adjacency.

The unchanged guide also contains inconsistent partial-credit descriptions. Automated check counts do not translate into rubric marks; markers retain the final judgment.

## Verification and maintenance

From the project root:

```bash
python3 -m auto_marking.scripts.build_sample_tests
python3 -m auto_marking.scripts.verify_sample_tests
# With Docker Desktop running:
docker build -t automarktic-runner:local marking
python3 -m auto_marking.scripts.verify_sample_tests --docker
```

The verification script uses only authored reference fixtures, plus deliberately incorrect fixtures for every automated question. It verifies every expected passing case and ensures wrong answers are detected. Do not use its host evaluator on student code; student submissions belong in the isolated API/Docker workflow.

Cases are separate JSON/YAML configurations under `auto_marking/test_runner/questions/canvas-<id>/cases.yaml`. Trusted references live outside the mounted question folders in `auto_marking/test_runner/reference_answers/`. The catalog `auto_marking/test_runner/questions/sample-exam.json` registers suites in the backend and supplies offline review guidance to the frontend. Its recorded DOCX SHA-256 is:

`b0d2c357e222ac293cc7d284719b75abfdc8f0cadf439958ddc0e8b163c9e74a`

From `frontend/`, `npm run test:e2e:runner` verifies the browser's result display, preserved original answers/marks, manual-review explanations, and the existing real local AI repair workflow.
