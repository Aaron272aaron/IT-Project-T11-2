"""Run one isolated marking job and return a JSON-ready result."""

import argparse
import json
import math
import pathlib
import re
import subprocess
import uuid

from .interpret import load_marks, render, runner_failure, summarise


MARKING_DIR = pathlib.Path(__file__).resolve().parent
IDENTIFIER = re.compile(r"[A-Za-z0-9_-]+\Z")
DEFAULT_TIMEOUT_SECONDS = 300


def _source_dir(parent, identifier, label):
    if not isinstance(identifier, str) or not IDENTIFIER.fullmatch(identifier):
        raise ValueError(f"Invalid {label} ID")
    candidate = parent / identifier
    if not candidate.is_dir() or candidate.resolve().parent != parent.resolve():
        raise FileNotFoundError(f"{label.capitalize()} {identifier!r} was not found")
    return candidate.resolve()


def _docker_command(question_dir, submission_dir, output_dir, container_name):
    return [
        "docker", "run", "--rm", "--name", container_name,
        "--network", "none", "--memory", "256m", "--cpus", "1",
        "--pids-limit", "64", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "-v", f"{question_dir}:/cases:ro",
        "-v", f"{submission_dir}:/submission:ro",
        "-v", f"{output_dir}:/out",
        "-e", "CASES=/cases/cases.yaml", "marking",
    ]


def run_marking(question_id, submission_id, *, timeout_seconds=DEFAULT_TIMEOUT_SECONDS):
    """Return a completed result or a runner error; invalid inputs raise."""
    if (
        isinstance(timeout_seconds, bool)
        or not isinstance(timeout_seconds, (int, float))
        or not math.isfinite(timeout_seconds)
        or timeout_seconds <= 0
    ):
        raise ValueError("timeout_seconds must be positive")
    question_dir = _source_dir(MARKING_DIR / "questions", question_id, "question")
    submission_dir = _source_dir(MARKING_DIR / "submissions", submission_id, "submission")
    cases_path = question_dir / "cases.yaml"
    if not cases_path.is_file():
        raise RuntimeError(f"Question {question_id!r} has no cases.yaml")
    if not (submission_dir / "submission.py").is_file():
        raise FileNotFoundError(f"Submission {submission_id!r} has no submission.py")
    marks = load_marks(cases_path)

    run_id = uuid.uuid4().hex
    output_dir = MARKING_DIR / "out" / run_id
    try:
        output_dir.mkdir(parents=True, exist_ok=False)
    except OSError as exc:
        return {"run_id": run_id, **runner_failure("output_unavailable", f"Could not create the report directory: {exc}", marks)}
    container_name = f"marking-{run_id}"
    command = _docker_command(question_dir, submission_dir, output_dir.resolve(), container_name)

    try:
        process = subprocess.run(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired:
        try:
            subprocess.run(
                ["docker", "rm", "-f", container_name],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=10,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            pass
        summary = runner_failure("runner_timeout", "The overall marking run timed out", marks)
    except OSError as exc:
        summary = runner_failure("docker_unavailable", f"Docker could not start: {exc}", marks)
    else:
        report_path = output_dir / "report.json"
        if process.returncode not in (0, 1):
            summary = runner_failure("docker_failed", f"Docker exited with code {process.returncode}", marks)
        elif not report_path.is_file():
            summary = runner_failure("report_missing", "The container produced no report", marks)
        else:
            try:
                summary = summarise(json.loads(report_path.read_text()), marks)
            except (OSError, ValueError, TypeError, KeyError) as exc:
                summary = runner_failure("invalid_report", f"The report could not be read: {exc}", marks)
            if process.returncode == 1 and summary["verdict"] == "all_passed":
                summary = runner_failure("docker_failed", "Pytest exited with a failure despite reporting all cases passed", marks)

    return {"run_id": run_id, **summary}


def main():
    parser = argparse.ArgumentParser(description="Run tests for one submission")
    parser.add_argument("question_id")
    parser.add_argument("submission_id")
    parser.add_argument("--timeout-seconds", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--json", action="store_true", help="print the structured result")
    args = parser.parse_args()
    try:
        result = run_marking(args.question_id, args.submission_id, timeout_seconds=args.timeout_seconds)
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        if not args.json:
            parser.exit(2, f"{exc}\n")
        result = {
            "run_id": None,
            **runner_failure("invalid_input", str(exc)),
            "status": "input_error",
            "verdict": None,
            "verdict_text": "Invalid marking input",
        }
        print(json.dumps(result, indent=2))
        return 2
    print(json.dumps(result, indent=2) if args.json else render(result))
    return 0 if result["status"] == "completed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
