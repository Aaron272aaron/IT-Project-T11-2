"""Bounded background jobs connecting HTTP requests to the Docker runner."""

from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import re
import shutil
from threading import Lock
import time
from uuid import uuid4

from auto_marking.test_runner.execute import run_marking
from backend.paths import MARKING_DIR

CATALOG = json.loads((MARKING_DIR / "questions/sample-exam.json").read_text())["questions"]
SUITES = {item["questionKey"]: item["questionKey"].replace(":", "-") for item in CATALOG if item["automated"]}
SUITES["demo:5"] = "demo-5"
MANUAL = {item["questionKey"]: item["note"] for item in CATALOG if not item["automated"]}
_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="test-run")
_lock = Lock()
_jobs = {}


class RunnerBusy(RuntimeError):
    pass


def stop_runner():
    """Discard queued work and finish active containers before Docker stops."""
    _pool.shutdown(wait=True, cancel_futures=True)


def create_run(question_key, code, variant):
    if isinstance(question_key, str) and question_key in MANUAL:
        raise ValueError("Human review required. " + MANUAL[question_key])
    if not isinstance(question_key, str) or question_key not in SUITES:
        raise ValueError("No test cases are configured for this question yet.")
    if not isinstance(code, str) or not code.strip() or len(code.encode("utf-8")) > 12 * 1024 or "\x00" in code:
        raise ValueError("Choose a non-blank answer or code up to 12 KB.")
    if variant not in ("original", "recommendation"):
        raise ValueError("Choose original code or an AI recommendation.")
    with _lock:
        now = time.monotonic()
        for key in list(_jobs):
            if _jobs[key]["status"] in ("completed", "runner_error") and now - _jobs[key]["updated"] > 600:
                del _jobs[key]
        if sum(j["status"] in ("queued", "running") for j in _jobs.values()) >= 8 or len(_jobs) >= 64:
            raise RunnerBusy("The test runner is busy. Try again shortly.")
        run_id = uuid4().hex
        _jobs[run_id] = {"runId": run_id, "status": "queued", "questionKey": question_key,
                         "variant": variant, "codeDigest": hashlib.sha256(code.encode()).hexdigest(), "updated": now}
        _pool.submit(_execute, run_id, question_key, code)
        return {key: value for key, value in _jobs[run_id].items() if key != "updated"}


def get_run(run_id):
    if not isinstance(run_id, str) or not re.fullmatch(r"[a-f0-9]{32}", run_id):
        return None
    with _lock:
        job = _jobs.get(run_id)
        return {key: value for key, value in job.items() if key != "updated"} if job else None


def _execute(run_id, question_key, code):
    submission_dir = MARKING_DIR / "submissions" / f"api-{run_id}"
    try:
        with _lock:
            _jobs[run_id].update(status="running", updated=time.monotonic())
        suite_id = SUITES[question_key]
        spec = json.loads((MARKING_DIR / "questions" / suite_id / "cases.yaml").read_text())
        submission_dir.mkdir(mode=0o755, parents=True)
        (submission_dir / "submission.py").write_text(code, encoding="utf-8")
        summary = run_marking(suite_id, submission_dir.name, timeout_seconds=60)
        if summary["status"] != "completed":
            result = {"status": "runner_error", "message": "The test runner could not finish. Check Docker Desktop and the marking image, then retry.", "error": summary.get("error"), "cases": []}
        else:
            report = json.loads((MARKING_DIR / "out" / summary["run_id"] / "report.json").read_text())
            tests = {t["nodeid"].split("[")[-1].rstrip("]"): t for t in report["tests"]}
            cases = []
            for case in spec["cases"]:
                test = tests[case["name"]]
                properties = {key: value for item in test.get("user_properties", []) for key, value in item.items()}
                call = test.get("call", {})
                outcome = test["outcome"]
                error_kind = properties.get("error_kind")
                detail = properties.get("error_detail", "")
                if outcome == "failed" and not error_kind:
                    error_kind = "timeout" if "Timeout" in str(call.get("longrepr", "")) else "execution_error"
                    detail = "The code did not finish within the case time limit." if error_kind == "timeout" else "The code could not be evaluated."
                case_input = case.get("input") or f"{spec['entry']}({', '.join(repr(a) for a in case['args'])})"
                expected = case.get("expected_literal", case["expected"]) if case.get("check") != "type" else case["expected"]
                if spec.get("mode", "function") == "function" and "accepted" not in case:
                    expected = repr(case["expected"])
                cases.append({"name": case["name"], "input": case_input,
                              "expected": expected if isinstance(expected, str) else repr(expected),
                              "actual": str(properties.get("actual", "Not returned"))[:4000], "outcome": outcome,
                              "errorKind": error_kind, "error": str(detail)[:500], "duration": call.get("duration", 0)})
            result = {"status": "completed", "passed": summary["passed"], "total": len(cases), "cases": cases,
                      "duration": summary["duration"], "message": "Test results are evidence for your marking decision; no marks were changed."}
        with _lock:
            _jobs[run_id].update(result, updated=time.monotonic())
    except Exception:
        with _lock:
            _jobs[run_id].update(status="runner_error", message="The test runner is unavailable. You can continue marking manually.", cases=[], updated=time.monotonic())
    finally:
        shutil.rmtree(submission_dir, ignore_errors=True)
