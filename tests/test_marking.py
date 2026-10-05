"""Check API-facing marking results without starting Docker."""

import json
import pathlib
import subprocess
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from marking import execute
from marking.interpret import classify, load_marks, summarise


class MarkingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        question = self.root / "questions" / "q3"
        submission = self.root / "submissions" / "s1"
        question.mkdir(parents=True)
        submission.mkdir(parents=True)
        (question / "cases.yaml").write_text(
            "entry: reverse_words\ncases:\n"
            "  - name: basic\n    args: ['hello world']\n"
            "    expected: 'world hello'\n    marks: 2\n"
            "  - name: empty\n    args: ['']\n"
            "    expected: ''\n    marks: 1\n"
        )
        (submission / "submission.py").write_text("def reverse_words(s): return s\n")

    @staticmethod
    def report(outcomes=("passed", "passed"), collectors=None):
        return {
            "tests": [
                {
                    "nodeid": f"test_cases.py::test_case[{name}]",
                    "outcome": outcome,
                    "call": {"duration": 0.01, "longrepr": "E AssertionError" if outcome == "failed" else ""},
                }
                for name, outcome in zip(("basic", "empty"), outcomes)
            ],
            "collectors": collectors or [],
            "duration": 0.1,
        }

    def fake_docker(self, report, returncode=0):
        def run(command, **kwargs):
            output_mount = next(arg for arg in command if isinstance(arg, str) and arg.endswith(":/out"))
            pathlib.Path(output_mount[:-5], "report.json").write_text(json.dumps(report))
            return SimpleNamespace(returncode=returncode)
        return run

    def test_each_run_has_its_own_report_and_json_result(self):
        with patch.object(execute, "MARKING_DIR", self.root), patch.object(
            execute.subprocess, "run", side_effect=self.fake_docker(self.report())
        ) as docker:
            first = execute.run_marking("q3", "s1")
            second = execute.run_marking("q3", "s1")

        self.assertNotEqual(first["run_id"], second["run_id"])
        self.assertEqual(first["status"], "completed")
        self.assertEqual(first["marks_earned"], 3)
        self.assertEqual(first["marks_available"], 3)
        self.assertIsNone(first["error"])
        self.assertTrue((self.root / "out" / first["run_id"] / "report.json").is_file())
        for call in docker.call_args_list:
            command = call.args[0]
            self.assertIn(f"{(self.root / 'questions' / 'q3').resolve()}:/cases:ro", command)
            self.assertIn(f"{(self.root / 'submissions' / 's1').resolve()}:/submission:ro", command)

    def test_failed_cases_are_valid_results_even_when_pytest_exits_one(self):
        with patch.object(execute, "MARKING_DIR", self.root), patch.object(
            execute.subprocess, "run",
            side_effect=self.fake_docker(self.report(("passed", "failed")), returncode=1),
        ):
            result = execute.run_marking("q3", "s1")
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["verdict"], "partial")
        self.assertEqual(result["marks_earned"], 2)

    def test_missing_or_incomplete_report_never_awards_zero(self):
        self.assertEqual(summarise({"tests": []}, {"basic": 2})["status"], "runner_error")
        self.assertEqual(
            summarise(self.report(collectors=[{"outcome": "failed"}]), {"basic": 2, "empty": 1})["status"],
            "runner_error",
        )
        with patch.object(execute, "MARKING_DIR", self.root), patch.object(
            execute.subprocess, "run", return_value=SimpleNamespace(returncode=0)
        ):
            result = execute.run_marking("q3", "s1")
        self.assertEqual(result["error"]["code"], "report_missing")
        self.assertIsNone(result["marks_earned"])

    def test_report_cases_must_match_configuration(self):
        result = summarise(self.report(outcomes=("passed",)), {"basic": 2, "empty": 1})
        self.assertEqual(result["error"]["code"], "case_mismatch")
        self.assertIsNone(result["marks_earned"])

    def test_missing_student_dependency_is_not_a_missing_submission(self):
        test = {
            "outcome": "failed",
            "call": {"longrepr": "E ModuleNotFoundError: No module named 'student_helper'"},
        }
        self.assertEqual(classify([test]), "crashed")

    def test_invalid_marks_configuration_fails(self):
        cases_path = self.root / "questions" / "q3" / "cases.yaml"
        cases_path.write_text("cases:\n  - name: basic\n    marks: -1\n")
        with self.assertRaises(ValueError):
            load_marks(cases_path)

    def test_invalid_ids_do_not_reach_docker(self):
        with patch.object(execute, "MARKING_DIR", self.root), patch.object(execute.subprocess, "run") as docker:
            with self.assertRaises(ValueError):
                execute.run_marking("../q3", "s1")
            with self.assertRaises(FileNotFoundError):
                execute.run_marking("q3", "missing")
        docker.assert_not_called()

    def test_global_timeout_is_a_runner_error(self):
        timeout = subprocess.TimeoutExpired(cmd="docker", timeout=1)
        with patch.object(execute, "MARKING_DIR", self.root), patch.object(
            execute.subprocess, "run",
            side_effect=[timeout, SimpleNamespace(returncode=0)],
        ) as docker:
            result = execute.run_marking("q3", "s1", timeout_seconds=1)
        self.assertEqual(result["error"]["code"], "runner_timeout")
        self.assertEqual(docker.call_count, 2)


if __name__ == "__main__":
    unittest.main()
