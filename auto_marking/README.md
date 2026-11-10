# Auto marking

Answer grouping and automated test execution are grouped here. Human markers still confirm final marks.

| Folder / file | Contents |
| --- | --- |
| [`answer_grouping/`](answer_grouping/ANSWER_GROUPING_README.md) | Group answers and prepare tutor-controlled marking updates |
| [`test_runner/`](test_runner/README.md) | Docker image, isolated runner, test cases, reference answers and reports |
| `jobs.py` | Queue test jobs and return their results to the API |
| `docker_lifecycle.py` | Start Docker when needed and stop an app-owned Docker session safely |
| `scripts/build_sample_tests.py` | Prepare sample question suites |
| `scripts/verify_sample_tests.py` | Verify trusted reference and incorrect fixtures |

HTTP routes remain in `backend/api/grouping.py` and `backend/api/runner.py`. Their integration tests remain in `backend/tests/`; the marking screens remain in `frontend/`.

From the project root:

```bash
docker build -t automarktic-runner:local auto_marking/test_runner
python3 -m auto_marking.scripts.verify_sample_tests
python3 -m auto_marking.test_runner.execute canvas-3081194 similarity-correct --json
```

The first and third commands require Docker. See [runner setup](test_runner/README.md) and [grouping requirements](answer_grouping/INTEGRATION.md).
