# Code marking runner

The runner tests one Python submission in Docker and returns a structured result. It is ready for a future FastAPI service to call; this directory does not contain an API or database.

## Run locally

From the repository root:

```sh
python3 -m pip install -r marking/requirements.txt
docker build -t marking marking
./marking/run.sh q3 s1 --json
```

`run.sh` also works when launched from another directory. Each run gets a random `run_id` and writes its raw pytest report to `marking/out/<run_id>/report.json`. Generated run directories are ignored by Git. Docker must be running.

## Call from Python

```python
from marking.execute import run_marking

result = run_marking("q3", "s1")
```

`result` contains `run_id`, `status`, `verdict`, `passed`, `total`, `marks_earned`, `marks_available`, `duration`, `cases`, and `error`. `status` is `completed` when tests ran, including failed test cases. It is `runner_error` when Docker, test collection, or the report failed; in that case `marks_earned` is `null` and `error` has a code and message. Bad IDs, missing submissions, and invalid case configuration raise an exception before Docker starts. The command-line `--json` mode returns the same fields with `status: "input_error"` for these errors.

The configured case points are automatic test results. A future FastAPI worker should run `run_marking`, save its result under the `run_id`, and keep any human final mark separate. Do not run Docker inside an async request handler; use a background worker or job queue and let the API return the run ID for polling.

Question and submission IDs contain only letters, numbers, `_`, and `-`. The backend should select these IDs from authorised records rather than pass untrusted paths. Each question needs `cases.yaml`; each submission needs `submission.py`.

## Checks

```sh
python3 -m unittest discover -s tests -p test_marking.py
```

These checks mock Docker. A live Docker run requires the Docker daemon.
