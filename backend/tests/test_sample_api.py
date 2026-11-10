"""The sample endpoint serves only prepared local data with no-store headers."""
import http.client
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.api.server import ApiHandler, ThreadingHTTPServer

class SampleApiTests(unittest.TestCase):
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

    def request(self):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        try:
            connection.request("GET", "/api/demo/sample-exam", headers={"X-Automarktic-Demo": "1"})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), json.loads(response.read())
        finally:
            connection.close()

    def test_returns_prepared_sample_without_cache(self):
        with patch("backend.api.demo.Path") as path:
            file = path.return_value.parent.parent.__truediv__.return_value
            file.read_text.return_value = json.dumps({"id":"final", "title":"Sample exam", "sampleVersion":1})
            status, headers, result = self.request()
        self.assertEqual(status, 200)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(result["sampleVersion"], 1)

    def test_missing_sample_gives_preparation_instruction(self):
        with patch("backend.api.demo.Path") as path:
            path.return_value.parent.parent.__truediv__.return_value.read_text.side_effect = FileNotFoundError()
            status, _, result = self.request()
        self.assertEqual(status, 503)
        self.assertIn("backend.scripts.build_sample_exam", result["message"])
