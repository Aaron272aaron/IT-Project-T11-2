"""Verify standard parsing and real HTTP errors without LibreOffice or extra packages."""
import io
import json
import http.client
from pathlib import Path
import sys
import threading
import unittest
import zipfile
sys.path.insert(0, str(Path(__file__).resolve().parent))
from rubric_import import docx_lines, parse_rubric
from server import ApiHandler, ThreadingHTTPServer

class ImportTests(unittest.TestCase):
    def test_duplicate_scores_and_multiline_descriptions(self):
        result = parse_rubric(["Question 1", "Rubric:", "+2: Complete", "+1: Logic error", "Wrong direction", "+1: Another approach", "+0: Blank"])
        block = result["blocks"][0]
        self.assertEqual(block["questionNumbers"], [1])
        self.assertEqual([c["score"] for c in block["categories"]], [2,1,1,0])
        self.assertIn("Wrong direction", block["categories"][1]["description"])

    def test_shared_and_supplementary_questions(self):
        result = parse_rubric(["Q1", "Q2", "Marks for each of the two parts:", "+2 Correct", "+0 Blank", "Question 6a", "Marks:", "+3 Correct", "+0 Blank"])
        self.assertEqual(result["blocks"][0]["questionNumbers"], [1,2])
        self.assertEqual(result["blocks"][1]["questionNumbers"], [])

    def test_additive_totals_are_explicit_drafts(self):
        block = parse_rubric(["Rubric:", "+ 1 mark for each of the following done correctly:", "Example", "Randomness", "Repetition"])["blocks"][0]
        self.assertEqual([c["score"] for c in block["categories"]], [3,2,1,0])
        self.assertIn("Additive", block["warnings"][0])

    def test_wrapped_pdf_criterion_is_not_an_extra_mark(self):
        block = parse_rubric(["Rubric:", "+ 1 mark for each of the following done correctly:", "• Example", "• Randomness", "• Repetition", "over many instances"])["blocks"][0]
        self.assertEqual([c["score"] for c in block["categories"]], [3,2,1,0])
        self.assertIn("Repetition over many instances", block["categories"][0]["description"])

    def test_bad_documents_and_no_scores(self):
        for data in (b"fake", b"PKfake"):
            with self.assertRaises(ValueError): docx_lines(data)
        for lines in (["a scanned image"], ["Rubric:", "+1.001 Too precise"]):
            with self.assertRaises(ValueError): parse_rubric(lines)

    def test_actual_standard_document(self):
        sources = list(Path(__file__).resolve().parent.parent.glob("final-2025s1-marking-rubric*.docx"))
        if not sources: self.skipTest("Standard document not present")
        blocks = parse_rubric(docx_lines(sources[0].read_bytes()))["blocks"]
        self.assertEqual(len(blocks), 21)
        associated = [n for b in blocks for n in b["questionNumbers"]]
        self.assertEqual(associated, [n for n in range(1,38) if n not in range(14,18)])
        self.assertEqual([c["score"] for c in blocks[12]["categories"]], [6,5,4,3,2,1,0])

    def test_http_boundary(self):
        server = ThreadingHTTPServer(("127.0.0.1",0), ApiHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            for body, kind, expected in [(b'{"text":"Q1\\nRubric:\\n+2 Good\\n+0 Blank"}', "application/json",200),
                (b'{"text":false}',"application/json",422), (b"bad", "text/plain",415), (b"", "application/json",413),
                (b"not json", "application/json",422)]:
                connection = http.client.HTTPConnection(*server.server_address)
                connection.request("POST","/api/rubric/import",body,{"Content-Type":kind})
                response = connection.getresponse(); payload = json.loads(response.read())
                self.assertEqual(response.status,expected,payload); connection.close()
        finally: server.shutdown(); server.server_close(); thread.join()
