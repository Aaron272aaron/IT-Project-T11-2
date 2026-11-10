"""Tests for the syntax-aware answer grouping feature."""
import unittest

from answer_grouping import (
    Submission, group_answers, grouping_key,
    handle_grouping_request, mark_group, mark_student,
)


def submission(i, answer, question="Q1"):
    return Submission(str(i), f"student-{i}", question, answer)


class GroupingTests(unittest.TestCase):
    def test_insignificant_whitespace(self):
        self.assertEqual(grouping_key("x = 1"), grouping_key("x=1"))
        self.assertEqual(grouping_key("print( 1 )"), grouping_key("print(1)"))
        self.assertEqual(1, len(group_answers([submission(1, "a + b"), submission(2, "a+b")])))

    def test_string_contents_preserved(self):
        self.assertNotEqual(grouping_key('print("a b")'), grouping_key('print("ab")'))
        self.assertNotEqual(grouping_key("x = 'a b'"), grouping_key("x = 'ab'"))

    def test_token_differences_preserved(self):
        answers = ["a+b", "a-b", "A+b", "a+b;", "ab", "a=b", "a +  b;"]
        # Only the two semicolon variants collapse.
        self.assertEqual(6, len(group_answers([submission(i, v) for i, v in enumerate(answers)])))
        self.assertNotEqual(grouping_key("x−y"), grouping_key("x-y"))
        self.assertNotEqual(grouping_key("é"), grouping_key("e"))
        self.assertNotEqual(grouping_key('x="a"'), grouping_key("x='a'"))

    def test_comments_preserved(self):
        self.assertNotEqual(grouping_key("x=1 # first"), grouping_key("x=1 # second"))
        self.assertNotEqual(grouping_key("x=1"), grouping_key("x=1 # note"))

    def test_indentation_structure_not_width(self):
        self.assertEqual(grouping_key("if x:\n  print(x)"), grouping_key("if x:\n    print(x)"))
        self.assertNotEqual(grouping_key("if x:\n    print(x)\nprint(0)"), grouping_key("if x:\n    print(x)\n    print(0)"))

    def test_invalid_fragments_exact_fallback(self):
        self.assertNotEqual(grouping_key("return x"), grouping_key("return  x"))
        self.assertNotEqual(grouping_key("x ="), grouping_key("x="))
        self.assertEqual(grouping_key("return x"), grouping_key("return x"))

    def test_original_answers_preserved(self):
        groups = group_answers([submission(1, "a +b"), submission(2, "a+ b")])
        self.assertEqual(["a +b", "a+ b"], [s["answer"] for s in groups[0]["students"]])

    def test_deterministic_group_ids(self):
        rows = [submission(2, "x=1"), submission(1, "x = 1"), submission(3, "x=2")]
        self.assertEqual(group_answers(rows), group_answers(reversed(rows)))

    def test_invalid_inputs(self):
        with self.assertRaises(ValueError):
            group_answers([submission(1, "x"), submission(1, "y")])
        with self.assertRaises(ValueError):
            group_answers([submission(1, "x"), submission(2, "x", "Q2")])
        with self.assertRaises(TypeError):
            group_answers([submission(1, None)])
        with self.assertRaises(TypeError):
            group_answers(["plain string"])
        with self.assertRaises(TypeError):
            grouping_key(None)

    def test_empty(self):
        self.assertEqual([], group_answers([]))

    def test_api_and_chart(self):
        response = handle_grouping_request({"answers": [
            {"submission_id": "1", "student_id": "s1", "question_id": "Q1", "answer": "a + b"},
            {"submission_id": "2", "student_id": "s2", "question_id": "Q1", "answer": "a+b"},
        ]})
        self.assertEqual(1, response["group_count"])
        self.assertEqual(2, response["bar_chart"][0]["count"])
        self.assertEqual(2, response["submission_count"])
        with self.assertRaises(ValueError):
            handle_grouping_request({"answers": [], "whitespace_mode": "all"})
        with self.assertRaises(ValueError):
            handle_grouping_request({"answers": [], "fuzzy": True})

    def test_marking_requires_explicit_call(self):
        group = group_answers([submission(1, "x"), submission(2, "x")])[0]
        self.assertEqual([{"submission_id": "1", "final_mark": "2"},
                          {"submission_id": "2", "final_mark": "2"}], mark_group(group, 2, 5))
        self.assertEqual({"submission_id": "1", "final_mark": "1.5"}, mark_student("1", "1.5", 5))
        with self.assertRaises(ValueError):
            mark_student("1", 6, 5)
        with self.assertRaises(ValueError):
            mark_student("1", "NaN", 5)

    def test_ten_thousand(self):
        groups = group_answers(submission(i, "same") for i in range(10000))
        self.assertEqual(10000, groups[0]["count"])


if __name__ == "__main__":
    unittest.main()
