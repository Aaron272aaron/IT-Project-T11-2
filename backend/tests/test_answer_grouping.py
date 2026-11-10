"""FR2 grouping and real HTTP boundary checks using synthetic responses."""
import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer

from auto_marking.answer_grouping import Submission, group_answers, handle_grouping_request, grouping_key
from auto_marking.answer_grouping.core import short_answer_key
from backend.api.handler import ApiHandler


def row(student, text, question="q"):
    return {"submission_id": student, "student_id": student, "question_id": question, "answer": text}


class GroupingTests(unittest.TestCase):
    def test_exact_outputs_preserve_spaces_quotes_case_and_line_breaks(self):
        texts = ["'a b'", "'a b'", "'ab'", '"a b"', "'A b'", "'a\u00a0b'", "'a b'\n", "True", "true", "1", "1.0", ""]
        answers = [row(str(index), text) for index, text in enumerate(texts)]
        result = handle_grouping_request({"answers": answers}, mode="exact")
        self.assertEqual(result["group_count"], len(texts) - 1)
        self.assertEqual(result["groups"][0]["count"], 2)
        self.assertEqual(result["groups"][0]["answer"], "'a b'")
        self.assertEqual(result, handle_grouping_request({"answers": list(reversed(answers))}, mode="exact"))
        with self.assertRaises(ValueError):
            handle_grouping_request({"answers": answers}, mode="exact", unicode_spaces=["\u00a0"])

    def test_plain_short_answers_group_even_when_not_valid_python(self):
        answers = [row("a", "the answer is blue"), row("b", "the  answeris blue "), row("c", "the answer is Blue"), row("d", "the answer is blue!")]
        result = handle_grouping_request({"answers": answers}, mode="spaces")
        self.assertEqual([group["count"] for group in result["groups"]], [2, 1, 1])
        self.assertEqual(result["groups"][0]["students"], [
            {key: value for key, value in answer.items() if key != "question_id"} for answer in answers[:2]])

    def test_unapproved_unicode_tabs_newlines_punctuation_and_case_stay_significant(self):
        for answer in ("a\tb", "a\nb", "a\u00a0b", "a+b", "A b", "a-b"):
            self.assertNotEqual(short_answer_key(answer), short_answer_key("a b"))
        self.assertEqual(short_answer_key("a\u00a0b", ["\u00a0"]), short_answer_key("a b"))
        for rule in ("+", "", "ab", "\t"):
            with self.assertRaises(ValueError):
                short_answer_key("a b", [rule])

    def test_existing_syntax_mode_preserves_string_values_and_block_structure(self):
        self.assertEqual(grouping_key("a + b"), grouping_key("a+b"))
        self.assertNotEqual(grouping_key("'a b'"), grouping_key("'ab'"))
        self.assertNotEqual(grouping_key("def f():\n    x=1\n    return x"), grouping_key("def f():\n    x=1\nreturn x"))
        self.assertNotEqual(grouping_key("not valid code"), grouping_key("not  valid code"))

    def test_order_stable_and_questions_or_duplicate_ids_rejected(self):
        submissions = [Submission(**row("a", "x y")), Submission(**row("b", "xy"))]
        self.assertEqual(group_answers(submissions, mode="spaces"), group_answers(reversed(submissions), mode="spaces"))
        for answers in ([row("a", "x"), row("a", "x")], [row("a", "x"), row("b", "x", "other")]):
            with self.assertRaises(ValueError):
                handle_grouping_request({"answers": answers}, mode="spaces")

    def test_ten_thousand_rows_and_limits(self):
        answers = [row(str(index), "plain language answer " if index % 2 else "plainlanguageanswer") for index in range(10_000)]
        result = handle_grouping_request({"answers": answers}, mode="spaces")
        self.assertEqual(result["group_count"], 1)
        self.assertEqual(result["groups"][0]["count"], 10_000)
        with self.assertRaises(ValueError):
            handle_grouping_request({"answers": answers + [row("extra", "x")]}, mode="spaces")


class GroupingApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ApiHandler)
        cls.server.allow_demo_api = True
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()

    def send(self, payload, content_type="application/json"):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        try:
            connection.request("POST", "/api/answer-groups", json.dumps(payload), {"Content-Type": content_type, "X-App-Request": "AutoMarktic", "X-Automarktic-Demo": "1"})
            response = connection.getresponse()
            return response.status, json.loads(response.read()), response.getheader("Cache-Control")
        finally:
            connection.close()

    def test_grouping_and_approved_rule_through_http(self):
        payload = {"question_type": "short-answer", "unicode_spaces": [], "answers": [row("a", "blue sky"), row("b", "blue\u00a0sky")]}
        status, result, cache = self.send(payload)
        self.assertEqual((status, result["group_count"], cache), (200, 2, "no-store"))
        payload["unicode_spaces"] = ["\u00a0"]
        self.assertEqual(self.send(payload)[1]["group_count"], 1)

    def test_expression_outputs_use_exact_matching_through_http(self):
        payload = {"question_type": "expression-output", "unicode_spaces": [], "answers": [row("a", "[1, 2]"), row("b", "[1, 2]"), row("c", "[1,2]")]}
        status, result, cache = self.send(payload)
        self.assertEqual((status, result["group_count"], cache), (200, 2, "no-store"))
        self.assertEqual(result["groups"][0]["count"], 2)
        payload["unicode_spaces"] = ["\u00a0"]
        self.assertEqual(self.send(payload)[0], 422)

    def test_malformed_unsupported_types_and_rules_are_rejected(self):
        valid = {"question_type": "short-answer", "unicode_spaces": [], "answers": [row("a", "yes")]}
        for payload in ({}, {**valid, "question_type": "coding"}, {**valid, "unicode_spaces": ["+"]}, {**valid, "answers": [row("a", "x"), row("a", "x")]}, {**valid, "extra": True}):
            self.assertEqual(self.send(payload)[0], 422)
        self.assertEqual(self.send(valid, "text/plain")[0], 415)
