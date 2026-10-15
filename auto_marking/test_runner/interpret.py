#!/usr/bin/env python3
"""Turn a pytest-json-report file into a marker-readable summary.

Usage:
    python3 interpret.py out/report.json
    python3 interpret.py out/report.json --cases questions/q3/cases.yaml
    python3 interpret.py out/report.json --cases questions/q3/cases.yaml --json
"""

import argparse
import json
import math
import pathlib
import re
import sys

# Verdicts, most severe first. The order matters: a submission that did not
# compile should never be described as "logic errors".
DID_NOT_COMPILE = "did_not_compile"
NO_SUBMISSION = "no_submission"
ENTRY_NOT_FOUND = "entry_not_found"
TIMED_OUT = "timed_out"
CRASHED = "crashed"
PARTIAL = "partial"
ALL_PASSED = "all_passed"
RUNNER_ERROR = "runner_error"

VERDICT_TEXT = {
    DID_NOT_COMPILE: "Did not compile - no case was ever executed",
    NO_SUBMISSION: "No submission file found",
    ENTRY_NOT_FOUND: "Expected function not defined",
    TIMED_OUT: "Timed out - likely an infinite loop",
    CRASHED: "Raised an exception before returning",
    PARTIAL: "Ran, some cases failed",
    ALL_PASSED: "All cases passed",
    RUNNER_ERROR: "The marking run did not produce valid results",
}


def case_name(nodeid):
    """test_cases.py::test_case[basic] -> basic"""
    m = re.search(r"\[(.+)\]$", nodeid)
    return m.group(1) if m else nodeid


def error_of(test):
    """Shortest useful error string for one test."""
    call = test.get("call", {})
    crash = call.get("crash", {}).get("message", "")
    if crash:
        # crash messages are often multi-line; the last line is the exception
        lines = [ln.strip() for ln in crash.strip().splitlines() if ln.strip()]
        return lines[-1] if lines else ""
    longrepr = call.get("longrepr", "")
    if "Failed: Timeout" in longrepr:
        return "Timeout"
    for ln in reversed(longrepr.splitlines()):
        ln = ln.strip().lstrip("E").strip()
        if ln and not ln.startswith(("_", ">")):
            return ln
    return ""


def classify(tests):
    """Decide one verdict for the whole submission."""
    if not tests:
        return RUNNER_ERROR

    errors = [error_of(t) for t in tests]
    outcomes = [t.get("outcome") for t in tests]
    joined = " ".join(errors)

    if all(o == "passed" for o in outcomes):
        return ALL_PASSED
    if re.search(r"\b(SyntaxError|IndentationError|TabError)\b", joined):
        return DID_NOT_COMPILE
    if re.search(r"ModuleNotFoundError: No module named ['\"]submission['\"]", joined):
        return NO_SUBMISSION
    if "has no attribute" in joined or "AttributeError: module" in joined:
        return ENTRY_NOT_FOUND
    if "Timeout" in joined:
        return TIMED_OUT
    if any(o == "passed" for o in outcomes):
        return PARTIAL
    # Nothing passed and it is not a compile problem: distinguish a raised
    # exception from a plain wrong answer.
    if re.search(
        r"\b(TypeError|ValueError|IndexError|KeyError|ZeroDivisionError|NameError|"
        r"ModuleNotFoundError|ImportError|AttributeError|RuntimeError)\b",
        joined,
    ):
        return CRASHED
    return PARTIAL


def load_marks(cases_path):
    """Read the configured marks; fail if a requested configuration is unusable."""
    if not cases_path:
        return {}
    p = pathlib.Path(cases_path)
    try:
        import yaml
    except ImportError as exc:
        raise RuntimeError("PyYAML is required to load case marks") from exc
    try:
        spec = yaml.safe_load(p.read_text())
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid cases.yaml: {exc}") from exc
    if not isinstance(spec, dict) or not isinstance(spec.get("cases"), list) or not spec["cases"]:
        raise ValueError("cases.yaml must contain a non-empty cases list")
    marks = {}
    for case in spec["cases"]:
        if not isinstance(case, dict) or not isinstance(case.get("name"), str):
            raise ValueError("each case needs a string name")
        name = case["name"]
        value = case.get("marks", 0)
        if (
            not name or name in marks or isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value) or value < 0
        ):
            raise ValueError(f"invalid or duplicate marks for case {name!r}")
        marks[name] = value
    return marks


def runner_failure(code, message, marks=None, duration=0.0):
    """A failed runner has no earned mark, even if cases have configured marks."""
    return {
        "status": RUNNER_ERROR,
        "verdict": RUNNER_ERROR,
        "verdict_text": VERDICT_TEXT[RUNNER_ERROR],
        "passed": 0,
        "total": 0,
        "marks_earned": None,
        "marks_available": sum(marks.values()) if marks else None,
        "duration": round(duration, 3),
        "cases": [],
        "error": {"code": code, "message": message},
    }


def summarise(report, marks):
    if not isinstance(report, dict) or not isinstance(report.get("tests"), list):
        return runner_failure("invalid_report", "The report has no tests list", marks)
    tests = report["tests"]
    duration = report.get("duration", 0.0)
    collectors = report.get("collectors", [])
    if not isinstance(collectors, list) or not all(isinstance(c, dict) for c in collectors):
        return runner_failure("invalid_report", "The report has an invalid collectors list", marks)
    if not all(isinstance(t, dict) and isinstance(t.get("nodeid"), str) for t in tests):
        return runner_failure("invalid_report", "The report has invalid test cases", marks)
    if any(
        not isinstance(t.get(phase, {}), dict)
        for t in tests for phase in ("setup", "call", "teardown")
    ):
        return runner_failure("invalid_report", "A test has an invalid phase result", marks)
    if any(t.get("outcome") not in ("passed", "failed") for t in tests):
        return runner_failure("invalid_report", "A test has an invalid outcome", marks)
    if any(
        t.get(phase, {}).get("outcome") == "failed"
        for t in tests for phase in ("setup", "teardown")
    ):
        return runner_failure("test_setup_failed", "Test setup or cleanup failed", marks)
    if not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration < 0:
        return runner_failure("invalid_report", "The report has an invalid duration", marks)
    if any(c.get("outcome") == "failed" for c in collectors):
        return runner_failure("collection_failed", "Pytest could not collect the test cases", marks, duration)
    if not tests:
        return runner_failure("no_tests", "The runner did not execute any test cases", marks, duration)

    names = [case_name(t["nodeid"]) for t in tests]
    if marks and (len(names) != len(set(names)) or set(names) != set(marks)):
        return runner_failure("case_mismatch", "Reported cases do not match cases.yaml", marks, duration)
    verdict = classify(tests)

    rows = []
    for t in tests:
        name = case_name(t["nodeid"])
        rows.append({
            "case": name,
            "outcome": t.get("outcome", "unknown"),
            "marks_available": marks.get(name),
            "marks_earned": marks.get(name, 0) if t.get("outcome") == "passed" else 0,
            "duration": round(t.get("call", {}).get("duration", 0.0), 4),
            "error": error_of(t),
        })

    available = sum(m for m in marks.values()) if marks else None
    earned = sum(r["marks_earned"] for r in rows) if marks else None

    return {
        "status": "completed",
        "verdict": verdict,
        "verdict_text": VERDICT_TEXT[verdict],
        "passed": sum(1 for r in rows if r["outcome"] == "passed"),
        "total": len(rows),
        "marks_earned": earned,
        "marks_available": available,
        "duration": round(duration, 3),
        "cases": rows,
        "error": None,
    }


def render(s):
    if s["status"] == RUNNER_ERROR:
        message = f"{s['verdict_text']}: {s['error']['message']}"
        return f"Run {s['run_id']}\n{message}" if "run_id" in s else message
    out = []
    if "run_id" in s:
        out.append(f"Run {s['run_id']}")
    head = f"{s['verdict_text']}   ({s['passed']}/{s['total']} cases"
    if s["marks_available"] is not None:
        head += f", {s['marks_earned']}/{s['marks_available']} marks"
    head += f", {s['duration']}s)"
    out.append(head)
    out.append("")

    w = max([len(r["case"]) for r in s["cases"]] + [4])
    for r in s["cases"]:
        tick = "PASS" if r["outcome"] == "passed" else "FAIL"
        mk = ""
        if r["marks_available"] is not None:
            mk = f"  {r['marks_earned']}/{r['marks_available']}"
        line = f"  {tick}  {r['case']:<{w}}{mk}  {r['duration']:>7.3f}s"
        if r["error"]:
            line += f"  {r['error'][:70]}"
        out.append(line)

    if s["verdict"] == DID_NOT_COMPILE:
        out.append("")
        out.append("  Note: the same error appears for every case because the file")
        out.append("  never compiled. No logic was tested. Do not read this as 0 marks")
        out.append("  for the approach - send it to the correction step first.")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description="Interpret a pytest JSON report.")
    ap.add_argument("report", help="path to report.json")
    ap.add_argument("--cases", help="path to cases.yaml, to attach marks")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of text")
    args = ap.parse_args()

    path = pathlib.Path(args.report)
    if not path.exists():
        result = runner_failure("report_missing", "The container produced no report")
        print(json.dumps(result) if args.json else render(result))
        return 2

    try:
        report = json.loads(path.read_text())
    except (OSError, ValueError) as exc:
        s = runner_failure("invalid_report", str(exc))
    else:
        try:
            marks = load_marks(args.cases)
        except (OSError, ValueError, RuntimeError) as exc:
            s = runner_failure("invalid_configuration", str(exc))
        else:
            s = summarise(report, marks)
    print(json.dumps(s, indent=2) if args.json else render(s))
    return 2 if s["status"] == RUNNER_ERROR else 0


if __name__ == "__main__":
    sys.exit(main())
