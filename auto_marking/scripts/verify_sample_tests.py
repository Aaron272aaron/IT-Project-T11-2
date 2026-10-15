"""Check authored reference fixtures locally or through the real Docker runner.

Only trusted reference/mutation fixtures are evaluated locally. Never pass
student submissions to the host evaluator; use the isolated API/runner instead.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import tempfile

from backend.paths import MARKING_DIR
from auto_marking.test_runner.execute import run_marking
from auto_marking.test_runner.runner.evaluate import evaluate


def suites():
    catalog = json.loads((MARKING_DIR / "questions/sample-exam.json").read_text())["questions"]
    for item in catalog:
        if item["automated"]:
            suite_id = item["questionKey"].replace(":", "-")
            spec = json.loads((MARKING_DIR / "questions" / suite_id / "cases.yaml").read_text())
            source = (MARKING_DIR / "reference_answers" / f"{suite_id}.py").read_text()
            yield item, suite_id, spec, source


def incorrect(spec):
    mode = spec.get("mode", "function")
    if mode == "function":
        return f"def {spec['entry']}(*args):\n    return None\n"
    if mode == "assignment":
        return f"{spec['target']} = 'incorrect'"
    if mode == "completion":
        return {"A": "has_query = True", "B": "if False:", "C": "index = 0", "D": "for j in range(0):", "E": "return False"}[spec["slot"]]
    if mode == "counterexample":
        return "match_prefix('app', ['application'])"
    return "'incorrect'"


def verify_fixture(item, suite_id, spec, source, *, docker=False):
    if not docker:
        correct = [evaluate(source, spec, case)[1] for case in spec["cases"]]
        wrong = [evaluate(incorrect(spec), spec, case)[1] for case in spec["cases"]]
        if not all(correct) or all(wrong):
            raise AssertionError(f"Q{item['questionNumber']}: reference/mutation check failed ({correct}, {wrong})")
        return len(correct)
    for variant, code in (("reference", source), ("incorrect", incorrect(spec))):
        with tempfile.TemporaryDirectory(prefix="verify-", dir=MARKING_DIR / "submissions") as directory:
            (Path(directory) / "submission.py").write_text(code)
            result = run_marking(suite_id, Path(directory).name, timeout_seconds=60)
        if result["status"] != "completed":
            raise AssertionError(f"Q{item['questionNumber']} {variant}: runner failed: {result.get('error')}")
        if result["total"] != len(spec["cases"]) or (variant == "reference" and result["passed"] != result["total"]) or (variant == "incorrect" and result["passed"] == result["total"]):
            raise AssertionError(f"Q{item['questionNumber']} {variant}: unexpected result ({result['passed']}/{result['total']})")
    print(f"Q{item['questionNumber']}: reference passed {len(spec['cases'])} checks; incorrect fixture rejected", flush=True)
    return len(spec["cases"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--docker", action="store_true")
    args = parser.parse_args()
    entries = list(suites())
    with ThreadPoolExecutor(max_workers=2 if args.docker else 1) as pool:
        futures = [pool.submit(verify_fixture, *entry, docker=args.docker) for entry in entries]
        checks = sum(future.result() for future in futures)
    print(f"Verified {checks} reference checks across {len(entries)} suites; all incorrect fixtures detected.")


if __name__ == "__main__":
    main()
