import { it, expect } from "vitest";
import {
  confirmSampleMark,
  confirmedResponseCount,
} from "../src/utils/sampleMarking";
import { assignSequentialPages } from "../src/utils/rubricPages";
import type { ExamRecord } from "../src/models/exams";
const exam: ExamRecord = {
  id: "final",
  title: "Sample",
  description: "",
  sampleVersion: 1,
  categories: { q: [{ id: "correct", score: 2, description: "Correct" }] },
  answers: {
    name: "test.csv",
    uploadedAt: "now",
    preview: {
      issues: [],
      questions: [
        {
          id: "q",
          text: "Question",
          maxMark: 2,
          column: 3,
          instruction: false,
        },
      ],
      students: [
        {
          id: "s",
          canvasId: "1",
          attempt: "1",
          answers: [
            {
              questionId: "q",
              original: "  code\n",
              sourceScore: "1",
              blank: false,
              unicodeReview: false,
            },
          ],
        },
      ],
    },
  },
};
it("keeps original answers and CSV scores separate from a confirmed category", () => {
  const next = confirmSampleMark(exam, "q", "s", "correct", "Checked");
  expect(next.marks?.q.s.score).toBe(2);
  expect(next.marks?.q.s.categoryId).toBe("correct");
  expect(next.answers).toBe(exam.answers);
  expect(exam.marks).toBeUndefined();
});
it("rejects missing responses and invalid categories", () => {
  expect(() =>
    confirmSampleMark(exam, "q", "missing", "correct", ""),
  ).toThrow();
  expect(() => confirmSampleMark(exam, "q", "s", "unknown", "")).toThrow();
  expect(() =>
    confirmSampleMark(
      {
        ...exam,
        categories: { q: [{ id: "bad", score: 3, description: "bad" }] },
      },
      "q",
      "s",
      "bad",
      "",
    ),
  ).toThrow();
});
it("assigns only the selected questions, including multiple pages each", () => {
  expect(assignSequentialPages(["a", "b", "c", "d"], 2, 3, 5, 2, 8)).toEqual({
    b: { start: 5, end: 6 },
    c: { start: 7, end: 8 },
  });
});
it("rejects overflow and invalid ranges instead of silently truncating", () => {
  expect(() => assignSequentialPages(["a", "b"], 1, 2, 24, 1, 24)).toThrow(
    "page 25",
  );
  for (const [first, last, start, pages] of [
    [0, 1, 1, 1],
    [2, 1, 1, 1],
    [1, 3, 1, 1],
    [1, 1, 0, 1],
    [1, 1, 1, 0],
    [1, 1, 1, 1.5],
  ])
    expect(() =>
      assignSequentialPages(["a", "b"], first, last, start, pages, 24),
    ).toThrow();
});

it("counts only current manual responses after switching a question to source review", () => {
  const next = confirmSampleMark(exam, "q", "s", "correct", "");
  expect(confirmedResponseCount(next)).toBe(1);
  expect(
    confirmedResponseCount({ ...next, autoMarkedQuestionIds: ["q"] }),
  ).toBe(0);
  expect(() =>
    confirmSampleMark(
      { ...next, autoMarkedQuestionIds: ["q"] },
      "q",
      "s",
      "correct",
      "",
    ),
  ).toThrow("manual marking");
});
