"""Reviewed sample-question checks: valid alternatives and meaningful mistakes."""
import json
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

from backend.paths import MARKING_DIR
from auto_marking.scripts import verify_sample_tests as verification
from auto_marking.scripts.verify_sample_tests import suites, verify_fixture
from auto_marking.test_runner.runner.evaluate import evaluate, parse_answer


class SampleCaseTests(unittest.TestCase):
    def spec(self, number):
        return next(spec for item, _, spec, _ in suites() if item["questionNumber"] == number)

    def test_docker_fixtures_are_readable_by_a_different_user(self):
        entry = next(suites())
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "submissions").mkdir()

            def run_fixture(suite_id, submission_id, **kwargs):
                submission = root / "submissions" / submission_id
                required = stat.S_IROTH | stat.S_IXOTH
                self.assertEqual(submission.stat().st_mode & required, required)
                source = submission / "submission.py"
                self.assertTrue(source.stat().st_mode & stat.S_IROTH)
                total = len(entry[2]["cases"])
                return {"status": "completed", "total": total,
                        "passed": total if source.read_text() == entry[3] else 0}

            with patch.object(verification, "MARKING_DIR", root), patch.object(
                verification, "run_marking", side_effect=run_fixture
            ) as runner:
                verify_fixture(*entry, docker=True)
                self.assertEqual(runner.call_count, 2)

    def test_all_questions_have_an_explicit_automated_or_manual_plan(self):
        catalog = json.loads((MARKING_DIR / "questions/sample-exam.json").read_text())["questions"]
        self.assertEqual([item["questionNumber"] for item in catalog], list(range(1, 38)))
        self.assertEqual(sum(item["automated"] for item in catalog), 27)
        for item in catalog:
            if not item["automated"]:
                self.assertTrue(item["note"])
                self.assertTrue(item["checklist"])
        for entry in suites():
            with self.subTest(question=entry[0]["questionNumber"]):
                verify_fixture(*entry)
                self.assertTrue(all(case["marks"] == 0 for case in entry[2]["cases"]))

    def test_output_value_and_type_are_separate_evidence_and_never_executed(self):
        spec = self.spec(7)
        self.assertTrue(evaluate("11 int", spec, spec["cases"][0])[1])
        self.assertFalse(evaluate("11 int", spec, spec["cases"][1])[1])
        self.assertTrue(evaluate("11.0, float", spec, spec["cases"][1])[1])
        self.assertFalse(evaluate("__import__('os').system('true')", spec, spec["cases"][0])[1])
        self.assertEqual(parse_answer("'list'")[0], "list")
        spec = self.spec(2)
        self.assertTrue(evaluate("Pyho", spec, spec["cases"][0])[1])
        self.assertFalse(evaluate("Pyho", spec, spec["cases"][1])[1])
        self.assertTrue(evaluate('“Pyho”, string', spec, spec["cases"][1])[1])

    def test_assignments_accept_alternatives_but_flag_multiple_statements_and_type_errors(self):
        spec = self.spec(10)
        alternative = "has_zero = 0 in values"
        self.assertTrue(all(evaluate(alternative, spec, case)[1] for case in spec["cases"]))
        two = "has_zero = False\nhas_zero = 0 in values"
        self.assertFalse(evaluate(two, spec, spec["cases"][0])[1])
        self.assertTrue(all(evaluate(two, spec, case)[1] for case in spec["cases"][1:]))
        self.assertFalse(evaluate("has_zero = int(0 in values)", spec, spec["cases"][2])[1])
        spec = self.spec(13)
        lowercase_only = "secure_pw = ''.join('*' if c in 'aeiou' else c for c in password)"
        self.assertFalse(evaluate(lowercase_only, spec, spec["cases"][3])[1])

    def test_q10_student_two_wrong_target_fails_structure_only(self):
        spec = self.spec(10)
        code = "contains_zero = 0 in values"
        actual, passed = evaluate(code, spec, spec["cases"][0])
        self.assertFalse(passed)
        self.assertIn("contains_zero", actual)
        self.assertIn("has_zero", actual)
        self.assertTrue(all(evaluate(code, spec, case)[1] for case in spec["cases"][1:]))

    def test_code_completion_uses_the_context_and_catches_off_by_one(self):
        spec = self.spec(19)
        self.assertTrue(all(evaluate("if nums[i] == query:", spec, case)[1] for case in spec["cases"]))
        with self.assertRaises(SyntaxError):
            evaluate("if query == nums[i]", spec, spec["cases"][0])
        spec = self.spec(21)
        self.assertTrue(any(not evaluate("for j in range(index - 1):", spec, case)[1] for case in spec["cases"]))

    def test_counterexamples_isolate_further_bugs_and_output_trace_accepts_digits(self):
        spec = self.spec(28)
        self.assertTrue(evaluate("match_prefix('App', ['app'])", spec, spec["cases"][0])[1])
        self.assertTrue(evaluate("match_prefix('1', ['2'])", spec, spec["cases"][0])[1])
        self.assertFalse(evaluate("match_prefix('1', [])", spec, spec["cases"][0])[1])
        spec = self.spec(36)
        for text in ("1010", "'1010'", '"1010"'):
            self.assertTrue(evaluate(text, spec, spec["cases"][0])[1])

    def test_best_word_accepts_optimal_ties_and_rejects_diagonal_or_nonoptimal_words(self):
        spec = self.spec(34)
        tied = spec["cases"][2]
        for word in ("ABA", "BAB"):
            self.assertTrue(evaluate(f"def best_word(*args): return {word!r}", spec, tied)[1])
        self.assertFalse(evaluate("def best_word(*args): return 'ABC'", spec, tied)[1])
        diagonal = spec["cases"][3]
        self.assertFalse(evaluate("def best_word(*args): return 'ZZZ'", spec, diagonal)[1])
        self.assertFalse(evaluate("def best_word(*args): return 'AAA'", spec, diagonal)[1])
