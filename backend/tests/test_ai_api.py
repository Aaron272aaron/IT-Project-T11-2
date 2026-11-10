"""Exercise AI HTTP validation and failure handling without downloading weights."""

import http.client
import json
import os
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.api.server import ApiHandler, ThreadingHTTPServer
from ai_tools import ai_recommendation as ai
from ai_tools.code_repair.model import RepairResult, MODEL_ID, ContextLimitExceeded

BROKEN = "def greet()\n    return 'hi'\n"
FIXED = "def greet():\n    return 'hi'\n"


class AiApiTests(unittest.TestCase):
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

    def request(self, payload, headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        try:
            connection.request("POST", "/api/ai/suggest-fix", json.dumps(payload),
                               {"X-App-Request": "AutoMarktic", "X-Automarktic-Demo": "1", **(headers or {"Content-Type": "application/json"})})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), json.loads(response.read())
        finally:
            connection.close()

    def test_parseable_code_bypasses_model_without_claiming_logic_is_correct(self):
        code = "def f():\n    return missing_name\n"
        with patch.object(ai, "SyntaxRepairModel", side_effect=AssertionError("No model needed")):
            status, headers, result = self.request({"code": code})
        self.assertEqual(status, 200)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(result["status"], "already_valid")
        self.assertIsNone(result["suggestedCode"])
        self.assertIn("logic", result["message"])

    def test_repairs_have_original_code_and_diff_but_no_marks(self):
        with patch.dict(os.environ, {"AI_REPAIR_ENABLED": "1"}), patch.object(ai, "_model") as model:
            model.repair.return_value = RepairResult(BROKEN, FIXED, "repaired", None, "cpu", MODEL_ID)
            status, _, result = self.request({"code": BROKEN})
        self.assertEqual(status, 200)
        self.assertEqual(result["originalCode"], BROKEN)
        self.assertEqual(result["suggestedCode"], FIXED)
        self.assertIn("-def greet()", result["diff"])
        self.assertIn("+def greet():", result["diff"])
        self.assertNotIn("mark", result)
        self.assertEqual(result["syntaxError"]["line"], 1)

    def test_empty_invalid_and_large_requests(self):
        for payload in ({}, [], {"code": ""}, {"code": 3}, {"code": "a\x00b"}, {"code": "a" * (ai.MAX_CODE_BYTES + 1)}):
            with self.subTest(payload_type=type(payload).__name__):
                self.assertEqual(self.request(payload)[0], 422)
        self.assertEqual(self.request({}, {"Content-Type": "text/csv"})[0], 415)
        self.assertEqual(self.request({}, {"Content-Type": "application/json", "Content-Length": "70000"})[0], 413)

    def test_marker_comment_reaches_the_model_without_changing_source(self):
        comment = "Add the missing colon on line 1."
        with patch.dict(os.environ, {"AI_REPAIR_ENABLED": "1"}), patch.object(ai, "_model") as model:
            model.repair.return_value = RepairResult(BROKEN, FIXED, "repaired", None, "cpu", MODEL_ID)
            status, _, result = self.request({"code": BROKEN, "comment": f"  {comment}  "})
            model.repair.assert_called_once_with(BROKEN, comment=comment)
        self.assertEqual(status, 200)
        self.assertEqual(result["originalCode"], BROKEN)
        self.assertEqual(result["suggestedCode"], FIXED)

    def test_invalid_comments_are_rejected_before_model_loading(self):
        for comment in (None, 3, [], "a" * (ai.MAX_COMMENT_CHARS + 1), "bad\x00comment"):
            with self.subTest(comment_type=type(comment).__name__), patch.object(ai, "_get_model") as load:
                self.assertEqual(self.request({"code": BROKEN, "comment": comment})[0], 422)
                load.assert_not_called()

    def test_disabled_model_and_loader_errors_are_recoverable(self):
        with patch.dict(os.environ, {"AI_REPAIR_ENABLED": "0"}):
            status, _, result = self.request({"code": BROKEN})
        self.assertEqual(status, 503)
        self.assertIn("manually", result["message"])
        with patch.dict(os.environ, {"AI_REPAIR_ENABLED": "1"}), patch.object(ai, "_model") as model:
            model.repair.side_effect = RuntimeError("private local path")
            status, _, result = self.request({"code": BROKEN})
        self.assertEqual(status, 503)
        self.assertNotIn("private", result["message"])

    def test_invalid_generation_never_becomes_a_recommendation(self):
        with patch.dict(os.environ, {"AI_REPAIR_ENABLED": "1"}), patch.object(ai, "_model") as model:
            model.repair.return_value = RepairResult(BROKEN, "bad code (", "invalid_generation", "error", "cpu", MODEL_ID)
            status, _, result = self.request({"code": BROKEN})
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "invalid_generation")
        self.assertIsNone(result["suggestedCode"])
        self.assertEqual(result["diff"], [])

    def test_only_context_overflow_is_reported_as_too_long(self):
        for error, expected in (
            (ContextLimitExceeded("token limit"), 422),
            (ValueError("private tokenizer failure"), 503),
        ):
            with self.subTest(error=type(error).__name__), patch.dict(os.environ, {"AI_REPAIR_ENABLED": "1"}), patch.object(ai, "_model") as model:
                model.repair.side_effect = error
                status, _, result = self.request({"code": BROKEN})
            self.assertEqual(status, expected)
            self.assertEqual("too long" in result["message"], expected == 422)
            self.assertNotIn("private", result["message"])

    def test_busy_model_is_rejected_without_queueing(self):
        ai._generation.acquire()
        try:
            with patch.dict(os.environ, {"AI_REPAIR_ENABLED": "1"}):
                self.assertEqual(self.request({"code": BROKEN})[0], 429)
        finally:
            ai._generation.release()
