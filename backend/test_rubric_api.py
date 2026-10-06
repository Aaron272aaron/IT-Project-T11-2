"""Test the DOCX HTTP boundary without relying on real student documents."""
import io
import json
import http.client
from pathlib import Path
import sys
import threading
import unittest
import zipfile
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parent))
from server import ApiHandler, ThreadingHTTPServer
from rubric_preview import convert_docx

class RubricApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ApiHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, body, length=None, content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        try:
            headers = {"Content-Type": content_type}
            if length is not None:
                headers["Content-Length"] = str(length)
            connection.request("POST", "/api/rubric/convert", body, headers)
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_rejects_wrong_type_and_size(self):
        self.assertEqual(self.request(b"test", content_type="text/csv")[0], 415)
        self.assertEqual(self.request(b"")[0], 413)
        self.assertEqual(self.request(b"", length=2 * 1024 * 1024 + 1)[0], 413)

    def test_invalid_archive_is_a_validation_error(self):
        self.assertEqual(self.request(b"PK fake")[0], 422)
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("notes.txt", "not a Word file")
        self.assertEqual(self.request(stream.getvalue())[0], 422)

    def test_conversion_response_and_actionable_unavailable_message(self):
        with patch("server.convert_docx", return_value={"status":"ok", "pdf":"JVBERg=="}) as convert:
            status, result = self.request(b"word bytes")
        self.assertEqual(status, 200)
        self.assertEqual(result["pdf"], "JVBERg==")
        convert.assert_called_once_with(b"word bytes")
        with patch("server.convert_docx", side_effect=RuntimeError("Install LibreOffice or upload PDF")):
            status, result = self.request(b"word bytes")
        self.assertEqual(status, 503)
        self.assertIn("LibreOffice", result["message"])

    def test_conversion_uses_isolated_profile_and_removes_temporary_files(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("word/document.xml", "<document/>")
            archive.writestr("[Content_Types].xml", "<Types/>")
        directories = []
        def convert(args, **kwargs):
            self.assertEqual(kwargs["timeout"], 60)
            self.assertTrue(args[1].startswith("-env:UserInstallation=file://"))
            source = Path(args[-1]); directories.append(source.parent)
            self.assertEqual(source.read_bytes(), stream.getvalue())
            source.with_suffix(".pdf").write_bytes(b"%PDF-1.4 test")
            return type("Result", (), {"returncode":0})()
        with patch("rubric_preview.shutil.which", return_value="soffice"), patch("rubric_preview.subprocess.run", side_effect=convert):
            self.assertEqual(convert_docx(stream.getvalue())["status"], "ok")
        self.assertFalse(directories[0].exists())
