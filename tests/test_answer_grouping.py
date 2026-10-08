"""Tests linked to answer grouping requirements FR2.1–FR2.5."""
import unittest
from answer_grouping import (
    GroupingOptions, Submission, group_answers, grouping_key,
    handle_grouping_request, mark_group, mark_student,
)


def submission(i, answer, question="Q1"):
    return Submission(str(i), f"student-{i}", question, answer)


class GroupingTests(unittest.TestCase):
    def test_ascii_spaces_ignored(self):
        groups = group_answers([submission(1, "a + b"), submission(2, "a+b")])
        self.assertEqual(1, len(groups))
        self.assertEqual(2, groups[0]["count"])

    def test_meaningful_differences_kept(self):
        values = ["a+b", "a-b", "A+b", "a +  b;", "a\t+b", "a\n+b", "ab", "a=b"]
        self.assertEqual(len(values), len(group_answers([submission(i, v) for i, v in enumerate(values)])))

    def test_optional_unicode_whitespace(self):
        self.assertNotEqual(grouping_key("a\u00a0b"), grouping_key("a b"))
        opts = GroupingOptions(extra_whitespace="\u00a0")
        self.assertEqual(grouping_key("a\u00a0b", opts), grouping_key("a b", opts))
        with self.assertRaises(ValueError):
            GroupingOptions(extra_whitespace=";")

    def test_nonascii_punctuation_preserved(self):
        self.assertNotEqual(grouping_key("x−y"), grouping_key("x-y"))
        self.assertNotEqual(grouping_key("é"), grouping_key("e"))

    def test_original_answers_preserved(self):
        groups = group_answers([submission(1, "a +b"), submission(2, "a+ b")])
        self.assertEqual(["a +b", "a+ b"], [s["answer"] for s in groups[0]["students"]])

    def test_determinism(self):
        rows = [submission(2, "two"), submission(1, "one"), submission(3, "t w o")]
        self.assertEqual(group_answers(rows), group_answers(reversed(rows)))

    def test_invalid_inputs(self):
        with self.assertRaises(ValueError):
            group_answers([submission(1, "x"), submission(1, "y")])
        with self.assertRaises(ValueError):
            group_answers([submission(1, "x"), submission(2, "x", "Q2")])
        with self.assertRaises(TypeError):
            group_answers([submission(1, None)])

    def test_empty(self):
        self.assertEqual([], group_answers([]))

    def test_api_and_bar_data(self):
        answer = handle_grouping_request({"answers": [
            {"submission_id": "1", "student_id": "s1", "question_id": "Q1", "answer": "a + b"},
            {"submission_id": "2", "student_id": "s2", "question_id": "Q1", "answer": "a+b"},
        ]})
        self.assertEqual(2, answer["bar_chart"][0]["count"])
        self.assertEqual(2, answer["submission_count"])
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
