# runner/test_cases.py
import importlib, os, pathlib, yaml, pytest

spec = yaml.safe_load(pathlib.Path(os.environ["CASES"]).read_text())

@pytest.mark.parametrize("case", spec["cases"], ids=lambda c: c["name"])
def test_case(case):
    fn = getattr(importlib.import_module("submission"), spec["entry"])
    assert fn(*case["args"]) == case["expected"]