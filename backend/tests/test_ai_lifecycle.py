"""Startup reuse and safe shutdown without downloading model weights."""
import contextlib
import io
import os
import threading
import unittest
import weakref
from types import SimpleNamespace
from unittest.mock import Mock, patch

from backend.api import server
from ai_tools import ai_recommendation as ai
from ai_tools.code_repair import SyntaxRepairModel
from ai_tools.code_repair.model import RepairResult, MODEL_ID

BROKEN = "def greet()\n    return 'hi'\n"
FIXED = "def greet():\n    return 'hi'\n"


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        for target in ("DockerLifecycle", "stop_runner", "AccountStore"):
            dependency = patch.object(server, target)
            dependency.start()
            self.addCleanup(dependency.stop)
        event = patch.object(ai, "_closing", threading.Event())
        event.start()
        self.addCleanup(event.stop)

    def test_startup_loads_once_and_repairs_reuse_it_until_shutdown(self):
        with patch.dict(os.environ, {"AI_REPAIR_ENABLED": "1"}), patch.object(ai, "_model", None), patch.object(ai, "SyntaxRepairModel") as factory:
            model = factory.return_value
            model.repair.return_value = RepairResult(BROKEN, FIXED, "repaired", None, "cpu", MODEL_ID)
            self.assertTrue(ai.start_model())
            self.assertTrue(ai.start_model())
            self.assertEqual(ai.suggest_fix(BROKEN)["status"], "repaired")
            self.assertEqual(ai.suggest_fix(BROKEN)["status"], "repaired")
            factory.assert_called_once()
            model.load.assert_called_once()
            self.assertEqual(model.repair.call_count, 2)
            self.assertTrue(ai.stop_model())
            self.assertFalse(ai.stop_model())
            model.close.assert_called_once()
            self.assertIsNone(ai._model)
            with self.assertRaises(ai.ModelUnavailable):
                ai.suggest_fix(BROKEN)
            factory.assert_called_once()

    def test_disabled_startup_does_not_construct_a_model(self):
        with patch.dict(os.environ, {"AI_REPAIR_ENABLED": "0"}), patch.object(ai, "SyntaxRepairModel") as factory:
            self.assertFalse(ai.start_model())
            factory.assert_not_called()

    def test_failed_or_interrupted_load_releases_partial_resources(self):
        for error in (RuntimeError("private model path"), KeyboardInterrupt()):
            with self.subTest(error=type(error).__name__), patch.dict(os.environ, {"AI_REPAIR_ENABLED": "1"}), patch.object(ai, "_model", None), patch.object(ai, "SyntaxRepairModel") as factory:
                model = factory.return_value
                model.load.side_effect = error
                with self.assertRaises(ai.ModelUnavailable if isinstance(error, Exception) else KeyboardInterrupt) as caught:
                    ai.start_model()
                self.assertNotIn("private", str(caught.exception))
                self.assertIsNone(ai._model)
                model.close.assert_called_once()

    def test_shutdown_waits_for_inflight_repair_before_releasing_model(self):
        started, finish, stopped = threading.Event(), threading.Event(), threading.Event()
        model = Mock()
        def repair(code):
            started.set()
            if not finish.wait(5):
                raise AssertionError("Test repair was not released")
            return RepairResult(BROKEN, FIXED, "repaired", None, "cpu", MODEL_ID)
        model.repair.side_effect = repair
        with patch.dict(os.environ, {"AI_REPAIR_ENABLED": "1"}), patch.object(ai, "_model", model):
            worker = threading.Thread(target=ai.suggest_fix, args=(BROKEN,))
            closer = threading.Thread(target=lambda: (ai.stop_model(), stopped.set()))
            worker.start()
            try:
                self.assertTrue(started.wait(2))
                closer.start()
                self.assertFalse(stopped.wait(0.05))
                model.close.assert_not_called()
            finally:
                finish.set()
                worker.join(5)
                if closer.ident is not None:
                    closer.join(5)
            self.assertTrue(stopped.is_set())
            model.close.assert_called_once()

    def test_api_preloads_before_serving_and_releases_on_exit(self):
        calls = []
        with patch.object(server, "ThreadingHTTPServer") as http, patch.object(server, "model_enabled", return_value=True), patch.object(server, "start_model", side_effect=lambda: calls.append("load")), patch.object(server, "stop_model", side_effect=lambda: calls.append("close")), patch.object(server.signal, "signal"), patch("sys.argv", ["server"]), contextlib.redirect_stdout(io.StringIO()):
            def serve():
                calls.append("serve")
                raise KeyboardInterrupt
            http.return_value.__enter__.return_value.serve_forever.side_effect = serve
            server.main()
        self.assertEqual(calls, ["load", "serve", "close"])

    def test_model_failure_still_starts_manual_marking_api(self):
        output = io.StringIO()
        with patch.object(server, "ThreadingHTTPServer") as http, patch.object(server, "model_enabled", return_value=True), patch.object(server, "start_model", side_effect=ai.ModelUnavailable("Manual marking remains available.")), patch.object(server, "stop_model"), patch.object(server.signal, "signal"), patch("sys.argv", ["server"]), contextlib.redirect_stdout(output):
            serving = http.return_value.__enter__.return_value.serve_forever
            serving.side_effect = KeyboardInterrupt
            server.main()
            serving.assert_called_once()
        self.assertIn("Manual marking remains available", output.getvalue())

    def test_close_releases_weight_references_and_device_cache(self):
        class Weight:
            pass
        for device in ("cpu", "cuda", "mps"):
            with self.subTest(device=device):
                engine = SyntaxRepairModel()
                weight = Weight()
                reference = weakref.ref(weight)
                engine._model = weight
                del weight
                cache = Mock()
                engine._torch = SimpleNamespace(cuda=cache, mps=cache)
                engine._device = device
                engine._tokenizer = object()
                engine.close()
                self.assertIsNone(reference())
                self.assertIsNone(engine._model)
                self.assertIsNone(engine._tokenizer)
                self.assertIsNone(engine._torch)
                self.assertEqual(cache.empty_cache.call_count, int(device != "cpu"))
                engine.close()
