import { expect, it } from "vitest";
import type { ExamRecord } from "../src/models/exams";
import {
  questionLockOwner,
  submissionLockOwner,
} from "../src/utils/submissionLocks";
import { confirmSampleMark } from "../src/utils/sampleMarking";
import { confirmGroupMark } from "../src/utils/answerGrouping";
import { groupingRows } from "../src/api/answerGroups";

const exam: ExamRecord = {
  id: "uploaded",
  title: "Uploaded exam",
  description: "",
  submissionLocks: { q: { a: "Alex Chen" } },
  questionTypes: { q: "short-answer" },
  categories: { q: [{ id: "full", score: 2, description: "Correct" }] },
  answers: {
    name: "answers.csv",
    uploadedAt: "now",
    preview: {
      issues: [],
      questions: [
        { id: "q", text: "Explain", instruction: false, column: 1, maxMark: 2 },
      ],
      students: ["a", "b"].map((id) => ({
        id,
        canvasId: id,
        attempt: "1",
        answers: [
          {
            questionId: "q",
            original: "Same answer",
            sourceScore: "0",
            blank: false,
            unicodeReview: false,
          },
        ],
      })),
    },
  },
  marks: {
    q: { a: { score: 1, comment: "Earlier mark", confirmedAt: "before" } },
  },
};

it("locks one student on one question without blocking other students or questions", () => {
  expect(submissionLockOwner(exam, "q", "a")).toBe("Alex Chen");
  expect(submissionLockOwner(exam, "q", "b")).toBeUndefined();
  expect(submissionLockOwner(exam, "other", "a")).toBeUndefined();
  expect(() => confirmSampleMark(exam, "q", "a", "full", "")).toThrow(
    "locked by Alex Chen",
  );
  expect(confirmSampleMark(exam, "q", "b", "full", "").marks?.q.b.score).toBe(
    2,
  );
});

it("locks the whole grouped question and rejects both individual and group saves", () => {
  const grouped: ExamRecord = {
    ...exam,
    questionTypes: { q: "expression-output" },
    questionLocks: { q: "Sam Taylor" },
  };
  expect(questionLockOwner(grouped, "q")).toBe("Sam Taylor");
  expect(submissionLockOwner(grouped, "q", "a")).toBeUndefined();
  for (const student of ["a", "b"])
    expect(() => confirmSampleMark(grouped, "q", student, "full", "")).toThrow(
      "question is locked by Sam Taylor",
    );
  expect(() =>
    confirmGroupMark(
      grouped,
      "q",
      {
        group_id: "same-answer",
        answer: "Same answer",
        count: 2,
        students: groupingRows(grouped, "q"),
      },
      [],
      "full",
      "",
      "Tutor",
    ),
  ).toThrow("question is locked by Sam Taylor");
  expect(grouped.marks).toEqual(exam.marks);
});

it("ignores submission locks on grouped questions without an explicit question lock", () => {
  const grouped: ExamRecord = {
    ...exam,
    questionTypes: { q: "expression-output" },
  };
  expect(questionLockOwner(grouped, "q")).toBeUndefined();
  expect(
    questionLockOwner(
      { ...grouped, questionTypes: { q: "short-answer" } },
      "q",
    ),
  ).toBeUndefined();
  expect(submissionLockOwner(exam, "q", "a")).toBe("Alex Chen");
});

it("preserves locked marks and excludes locked students from group history", () => {
  const rows = groupingRows(exam, "q");
  const next = confirmGroupMark(
    exam,
    "q",
    {
      group_id: "same-answer",
      answer: "Same answer",
      count: 2,
      students: rows,
    },
    [],
    "full",
    "Checked",
    "Tutor",
  );
  expect(next.marks?.q.a).toEqual(exam.marks?.q.a);
  expect(next.marks?.q.b.score).toBe(2);
  expect(next.groupMarkHistory?.at(-1)?.studentIds).toEqual(["b"]);
  expect(next.groupMarkHistory?.at(-1)?.previousMarks).toEqual({ b: null });
  expect(next.answers).toBe(exam.answers);
});

it("rejects a group with no available submissions", () => {
  const locked = {
    ...exam,
    submissionLocks: { q: { a: "Alex Chen", b: "Sam Taylor" } },
  };
  expect(() =>
    confirmGroupMark(
      locked,
      "q",
      {
        group_id: "same-answer",
        answer: "Same answer",
        count: 2,
        students: groupingRows(locked, "q"),
      },
      [],
      "full",
      "",
      "Tutor",
    ),
  ).toThrow("All responses in this group are locked");
});
