#!/usr/bin/env python3
"""Turn a pytest-json-report file into a marker-readable summary.

Usage:
    python3 interpret.py out/report.json
    python3 interpret.py out/report.json --cases questions/q3/cases.yaml
    python3 interpret.py out/report.json --cases questions/q3/cases.yaml --json
"""

import argparse
import json
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

VERDICT_TEXT = {
    DID_NOT_COMPILE: "Did not compile - no case was ever executed",
    NO_SUBMISSION: "No submission file found",
    ENTRY_NOT_FOUND: "Expected function not defined",
    TIMED_OUT: "Timed out - likely an infinite loop",
    CRASHED: "Raised an exception before returning",
    PARTIAL: "Ran, some cases failed",
    ALL_PASSED: "All cases passed",
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
        return NO_SUBMISSION

    errors = [error_of(t) for t in tests]
    outcomes = [t.get("outcome") for t in tests]
    joined = " ".join(errors)

    if all(o == "passed" for o in outcomes):
        return ALL_PASSED
    if re.search(r"\b(SyntaxError|IndentationError|TabError)\b", joined):
        return DID_NOT_COMPILE
    if "ModuleNotFoundError" in joined:
        return NO_SUBMISSION
    if "has no attribute" in joined or "AttributeError: module" in joined:
        return ENTRY_NOT_FOUND
    if "Timeout" in joined:
        return TIMED_OUT
    if any(o == "passed" for o in outcomes):
        return PARTIAL
    # Nothing passed and it is not a compile problem: distinguish a raised
    # exception from a plain wrong answer.
    if re.search(r"\b(TypeError|ValueError|IndexError|KeyError|ZeroDivisionError|NameError)\b", joined):
        return CRASHED
    return PARTIAL


def load_marks(cases_path):
    """{case_name: marks} from cases.yaml, or {} if unavailable."""
    if not cases_path:
        return {}
    p = pathlib.Path(cases_path)
    if not p.exists():
        print(f"warning: {p} not found, marks omitted", file=sys.stderr)
        return {}
    try:
        import yaml
    except ImportError:
        print("warning: pyyaml not installed, marks omitted", file=sys.stderr)
        return {}
    spec = yaml.safe_load(p.read_text()) or {}
    return {c["name"]: c.get("marks", 0) for c in spec.get("cases", [])}


def summarise(report, marks):
    tests = report.get("tests", [])
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
        "verdict": verdict,
        "verdict_text": VERDICT_TEXT[verdict],
        "passed": sum(1 for r in rows if r["outcome"] == "passed"),
        "total": len(rows),
        "marks_earned": earned,
        "marks_available": available,
        "duration": round(report.get("duration", 0.0), 3),
        "cases": rows,
    }


def render(s):
    out = []
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
        # A missing report is itself a result: the container produced nothing.
        result = {"verdict": NO_SUBMISSION,
                  "verdict_text": "No report produced - the container failed to run",
                  "passed": 0, "total": 0, "cases": []}
        print(json.dumps(result) if args.json else result["verdict_text"])
        return 2

    report = json.loads(path.read_text())
    s = summarise(report, load_marks(args.cases))
    print(json.dumps(s, indent=2) if args.json else render(s))
    return 0


if __name__ == "__main__":
    sys.exit(main())