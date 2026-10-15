"""HTTP validation and result isolation without requiring Docker."""
import hashlib
import http.client
import json
from pathlib import Path
import sys
import threading
import tempfile
import shutil
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.api.server import ApiHandler, ThreadingHTTPServer
from auto_marking import jobs as runs


class RunnerApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ApiHandler)
        cls.server.allow_demo_api = True
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, path, payload=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        try:
            connection.request(method, path, json.dumps(payload) if payload is not None else None,
                               {"Content-Type": "application/json", "X-App-Request": "AutoMarktic", "X-Automarktic-Demo": "1"})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), json.loads(response.read())
        finally:
            connection.close()

    def test_exact_source_and_variant_are_bound_to_each_result(self):
        code = "def similarity(board, char):\n    return 0\n"
        with patch.object(runs._pool, "submit"):
            status, headers, original = self.request("POST", "/api/test-runs", {
                "questionKey": "canvas:3081194", "code": code, "variant": "original"})
            _, _, recommendation = self.request("POST", "/api/test-runs", {
                "questionKey": "canvas:3081194", "code": code + "# revised\n", "variant": "recommendation"})
        try:
            self.assertEqual(status, 202)
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertEqual(original["codeDigest"], hashlib.sha256(code.encode()).hexdigest())
            self.assertNotEqual(original["runId"], recommendation["runId"])
            self.assertNotEqual(original["codeDigest"], recommendation["codeDigest"])
            self.assertEqual(recommendation["variant"], "recommendation")
            self.assertEqual(self.request("GET", f"/api/test-runs/{original['runId']}")[2], original)
            self.assertNotIn("code", original)
            self.assertNotIn("mark", original)
        finally:
            with runs._lock:
                runs._jobs.pop(original["runId"], None)
                runs._jobs.pop(recommendation["runId"], None)

    def test_invalid_requests_never_schedule_execution(self):
        base = {"questionKey": "canvas:3081194", "code": "print(1)", "variant": "original"}
        invalid = [{}, [], {**base, "questionKey": "../../etc"}, {**base, "code": ""},
                   {**base, "code": "a\x00b"}, {**base, "code": "x" * 12289},
                   {**base, "variant": "accepted"}]
        with patch.object(runs._pool, "submit") as submit:
            for payload in invalid:
                self.assertEqual(self.request("POST", "/api/test-runs", payload)[0], 422)
            submit.assert_not_called()
        self.assertEqual(self.request("GET", "/api/test-runs/not-a-run")[0], 404)

    def test_all_supported_sample_suites_are_registered_and_manual_reviews_do_not_schedule_jobs(self):
        self.assertEqual(len(runs.SUITES), 28)  # 27 sample questions and legacy demo Q5.
        with patch.object(runs._pool, "submit") as submit:
            status, _, result = self.request("POST", "/api/test-runs", {"questionKey": "canvas:3081173", "code": "A", "variant": "original"})
            self.assertEqual(status, 422)
            self.assertIn("Human review required", result["message"])
            submit.assert_not_called()

    def test_infrastructure_failure_has_no_failed_student_score(self):
        with patch.object(runs._pool, "submit"):
            job = runs.create_run("canvas:3081194", "print(1)", "original")
        try:
            with patch.object(runs, "run_marking", return_value={"status": "runner_error", "error": "docker_unavailable"}):
                runs._execute(job["runId"], "canvas:3081194", "print(1)")
            result = runs.get_run(job["runId"])
            self.assertEqual(result["status"], "runner_error")
            self.assertEqual(result["cases"], [])
            self.assertNotIn("passed", result)
            self.assertNotIn("mark", result)
            self.assertFalse((runs.MARKING_DIR / "submissions" / f"api-{job['runId']}").exists())
        finally:
            with runs._lock:
                runs._jobs.pop(job["runId"], None)

    def test_fresh_copy_creates_submission_parent_before_running(self):
        question = "canvas:3081194"
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            suite = runs.SUITES[question]
            shutil.copytree(runs.MARKING_DIR / "questions" / suite, root / "questions" / suite)
            with patch.object(runs._pool, "submit"):
                job = runs.create_run(question, "print(1)", "original")
            def check_submission(*args, **kwargs):
                source = root / "submissions" / f"api-{job['runId']}" / "submission.py"
                self.assertEqual(source.read_text(), "print(1)")
                return {"status": "runner_error", "error": "docker_unavailable"}
            try:
                with patch.object(runs, "MARKING_DIR", root), patch.object(runs, "run_marking", side_effect=check_submission) as runner:
                    runs._execute(job["runId"], question, "print(1)")
                runner.assert_called_once()
                self.assertEqual(runs.get_run(job["runId"])["error"], "docker_unavailable")
                self.assertFalse((root / "submissions" / f"api-{job['runId']}").exists())
            finally:
                with runs._lock:
                    runs._jobs.pop(job["runId"], None)
