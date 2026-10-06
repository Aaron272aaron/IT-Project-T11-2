"""Exercise the real parser and HTTP boundary using synthetic student data."""

import csv
import http.client
import io
import json
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import canvas_import
from server import ApiHandler, ThreadingHTTPServer

HEADERS = ["id", "sis_id", "attempt", "100: Part 1 Instructions", "0.0",
           "101: Short answer", "2.0", "102: Function", "2.0"]
CODE = 'def f():\r\n\treturn "你好, world"  \r\n'
ROW = ["11", "00123", "1", "", "0", "  3  ", "1", CODE, "2"]


def make_csv(rows=None, headers=None):
    """csv.writer quotes commas and multiline answers without modifying them."""
    stream = io.StringIO(newline="")
    csv.writer(stream).writerows([HEADERS if headers is None else headers,
                                 *( [ROW] if rows is None else rows)])
    return stream.getvalue().encode("utf-8")


class CsvApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # An OS-assigned port avoids interfering with the user's running API.
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ApiHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, body, headers=None, path="/api/canvas/preview"):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        try:
            connection.request("POST", path, body, headers or {"Content-Type": "text/csv"})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), json.loads(response.read())
        finally:
            connection.close()

    def test_calls_existing_module_preserves_raw_text_and_deletes_temporary_file(self):
        parser = canvas_import.csv_module.read_canvas_csv
        with patch.object(canvas_import.csv_module, "read_canvas_csv", wraps=parser) as called, \
             patch.object(canvas_import.csv_module, "open_database", side_effect=AssertionError("No database")):
            status, headers, result = self.request(b"\xef\xbb\xbf" + make_csv())
        self.assertEqual(status, 200)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(result["parser"], "csv import.py")
        called.assert_called_once()
        self.assertFalse(called.call_args.args[0].exists())
        preview = result["preview"]
        self.assertTrue(preview["questions"][0]["instruction"])
        student = preview["students"][0]
        self.assertEqual(student["id"], "00123")
        self.assertEqual(student["answers"][1]["original"], "  3  ")
        self.assertEqual(student["answers"][2]["original"], CODE)
        self.assertNotIn("mark", student["answers"][2])

    def test_blank_unicode_and_html_answers_remain_original(self):
        row = ROW.copy()
        row[5], row[7] = "", "<script>alert(1)</script>\u00a0"
        status, _, data = self.request(make_csv([row]))
        self.assertEqual(status, 200)
        answers = data["preview"]["students"][0]["answers"]
        self.assertTrue(answers[1]["blank"])
        self.assertTrue(answers[2]["unicodeReview"])
        self.assertEqual(answers[2]["original"], row[7])

    def test_invalid_files_block_partial_preview(self):
        for content in [b"", make_csv([]), b"wrong,headers\na,b", b"\xff\xfe\x00",
                        make_csv() + b'"unterminated', make_csv([ROW[:-1]]),
                        make_csv([ROW, ROW]), make_csv().replace(b"  3  ", b"bad\x00text")]:
            with self.subTest(content_length=len(content)):
                status, _, result = self.request(content)
                self.assertEqual(status, 422)
                self.assertEqual(result["status"], "invalid")
                self.assertEqual(result["preview"]["students"], [])
                self.assertTrue(any(i["severity"] == "error" for i in result["preview"]["issues"]))

    def test_duplicate_questions_bad_attempts_and_scores(self):
        repeated = HEADERS.copy()
        repeated[7] = "101: Function"
        damaged = HEADERS.copy()
        damaged[7] = "Lost question ID"
        candidates = [make_csv(headers=repeated), make_csv(headers=damaged)]
        for index, value in [(1, ""), (2, "0"), (8, "-1"), (8, "3"),
                             (8, "NaN"), (8, "Infinity"), (8, "0x2")]:
            row = ROW.copy()
            row[index] = value
            candidates.append(make_csv([row]))
        for content in candidates:
            self.assertEqual(self.request(content)[0], 422)

    def test_student_limit(self):
        rows = [[str(i), f"s{i}", *ROW[2:]] for i in range(10001)]
        self.assertEqual(self.request(make_csv(rows[:10000]))[0], 200)
        self.assertEqual(self.request(make_csv(rows))[0], 422)

    def test_http_limits_and_errors(self):
        self.assertEqual(self.request(b"", {"Content-Type": "application/json"})[0], 415)
        self.assertEqual(self.request(b"", {"Content-Type": "text/csv", "Content-Length": str(canvas_import.MAX_UPLOAD_BYTES + 1)})[0], 413)
        self.assertEqual(self.request(b"", {"Content-Type": "text/csv", "Content-Length": "-1"})[0], 400)
        self.assertEqual(self.request(b"", path="/api/missing")[0], 404)

    def test_unrepresentable_maximum_is_a_validation_error(self):
        headers = HEADERS.copy()
        headers[-1] = "1e999"
        self.assertEqual(self.request(make_csv(headers=headers))[0], 422)

    def test_parser_failure_cleans_up_and_hides_details(self):
        with patch.object(canvas_import.csv_module, "read_canvas_csv", side_effect=RuntimeError("private answer")) as called:
            status, _, result = self.request(make_csv())
        self.assertEqual(status, 500)
        self.assertNotIn("private answer", json.dumps(result))
        self.assertFalse(called.call_args.args[0].exists())


if __name__ == "__main__":
    unittest.main()
