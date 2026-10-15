# Python test runner

Build once from the project root with Docker Desktop running:

```bash
docker build -t automarktic-runner:local auto_marking/test_runner
```

Start the app with `npm run dev` from `frontend/`. On macOS the app opens Docker Desktop if needed, then stops it on Ctrl+C after active jobs finish, provided it started Docker and no containers remain. Docker that was already open stays open. Set `DOCKER_AUTOSTART=0` to manage it manually; other platforms require a manually started engine. On a student answer page, click **Run original tests** for code or **Check original answer** for literal outputs. After generating an AI syntax fix, click **Run recommendation tests** inside its review dialog. Each run shows input, expected output, actual output and errors. Original answers and marks are preserved.

The Sample exam has **27 automated question suites with 117 checks**, plus explicit human-review guidance for the remaining 10 questions. Outputs, assignments, code completion, selected debugging answers and all three coding questions are covered. See [question-by-question coverage and source discrepancies](../../docs/sample-test-coverage.md).

- Q32 (`canvas-3081194`) retains its six `similarity(board, char)` cases.
- Q33 and Q34 now test `most_common_letter(board)` and `best_word(board, values)`, including ties and edge cases.
- `demo-5/cases.yaml` retains six `clean_text(s)` cases for the legacy demo.

Cases are stored under `questions/`; submissions under `submissions/`; reports under `out/<run-id>/report.json`. The configurations use JSON syntax, which is valid YAML. `questions/sample-exam.json` is the shared backend/frontend coverage catalog. Build the image again after changing runner adapters. Rebuild and verify the authored suites with:

```bash
python3 -m auto_marking.scripts.build_sample_tests
python3 -m auto_marking.scripts.verify_sample_tests --docker
```

Command-line examples from the project root:

```bash
python3 -m auto_marking.test_runner.execute canvas-3081194 similarity-correct --json
python3 -m auto_marking.test_runner.execute canvas-3081194 similarity-incorrect --json
python3 -m auto_marking.test_runner.execute canvas-3081194 similarity-syntax-error --json
```

The examples produce 6/6, 1/6 and 0/6 passing cases respectively. Cases carry zero grading marks: the Tutor still selects and confirms the rubric score.

Each job executes in a fresh container with no network, read-only source mounts, a read-only root filesystem, a non-root user, 256 MB memory, one CPU, and a 64-process limit. Each case has five seconds; HTTP jobs have a 60-second overall limit. At most two jobs execute together and eight may be outstanding. Infrastructure errors are displayed separately from failed student tests. Temporary API submissions are removed after execution; result metadata remains in memory for approximately ten minutes and ignored report folders remain on disk.

From `frontend/`, `npm run test:e2e:runner` verifies original-code failure, real cached AI repair, passing recommendation tests, and unchanged answers/marks. It requires Docker Desktop, this image, Chrome, and the local model environment described in [ai_tools/code_repair/README.md](../../ai_tools/code_repair/README.md). Ordinary unit and offline browser tests do not require Docker or model inference.
