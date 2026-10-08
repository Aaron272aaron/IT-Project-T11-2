import { it, expect } from "vitest";
import type { ExamRecord } from "../src/models/exams";
import {
  saveCategories,
  affectedMarks,
  validateCategories,
} from "../src/utils/rubricEditor";
import { groupCategoryMap, groupCategories } from "../src/utils/rubricScores";
import { pdfRubricParagraphs } from "../src/utils/pdfRubricText";
const exam: ExamRecord = {
  id: "custom",
  title: "Custom",
  description: "",
  categories: {
    q: [
      { id: "yes", score: 2, description: "Correct" },
      { id: "other", score: 2, description: "Another valid approach" },
    ],
  },
  marks: {
    q: {
      s: {
        score: 2,
        categoryId: "yes",
        comment: "checked",
        confirmedAt: "before",
      },
      t: { score: 2, categoryId: "other", comment: "", confirmedAt: "before" },
    },
  },
  answers: {
    name: "a.csv",
    uploadedAt: "now",
    preview: {
      issues: [],
      students: [],
      questions: [
        { id: "q", text: "Q", maxMark: 2, column: 1, instruction: false },
      ],
    },
  },
};
it("updates all historical options after merging them into a single score", () => {
  const draft = groupCategoryMap(exam.categories);
  draft.q[0].score = 1.5;
  expect(affectedMarks(exam, draft)).toHaveLength(2);
  const next = saveCategories(exam, draft, [], "Adjusted standard");
  expect(next.marks?.q.s.score).toBe(1.5);
  expect(next.marks?.q.t.score).toBe(1.5);
  expect(next.marks?.q.t.categoryId).toBe("yes");
  expect(next.marks?.q.s.comment).toBe("checked");
  expect(exam.marks?.q.s.score).toBe(2);
  expect(next.answers).toBe(exam.answers);
  expect(next.rubricChanges?.[0].scoreChanges).toHaveLength(2);
});
it("preserves a deleted option's score and description without selecting a replacement", () => {
  const next = saveCategories(exam, { q: [] }, [], "Removed categories");
  expect(next.marks?.q.s.score).toBe(2);
  expect(next.marks?.q.s.categoryDescription).toBe("Correct");
  expect(next.rubricChanges?.[0].updatedMarks).toBe(0);
});
it("requires a reason before changing confirmed scores", () => {
  expect(() => saveCategories(exam, { q: [] }, [], " ")).toThrow("Explain");
});
it("rejects invalid scores, empty descriptions, duplicate IDs and missing questions", () => {
  for (const score of [-1, 3, NaN, Infinity, 1.001])
    expect(() =>
      validateCategories(exam, {
        q: [{ id: "x", score, description: "test" }],
      }),
    ).toThrow();
  expect(() =>
    validateCategories(exam, { q: [{ id: "x", score: 1, description: " " }] }),
  ).toThrow();
  expect(() =>
    validateCategories(exam, {
      q: [exam.categories!.q[0], exam.categories!.q[0]],
    }),
  ).toThrow();
  expect(() => validateCategories(exam, { missing: [] })).toThrow();
});
it("allows distinct descriptions at the same score and zero categories as an unconfigured draft", () => {
  expect(() => validateCategories(exam, exam.categories!)).not.toThrow();
  expect(() => validateCategories(exam, { q: [] })).not.toThrow();
});

it("joins PDF wrapped descriptions without merging distinct criteria or score options", () => {
  const lines = [
    "Rubric:",
    "+ 1 mark for each:",
    "• First criterion",
    "• Second criterion",
    "continued on next line",
    "+0: No answer",
    "or entirely incorrect.",
  ];
  const items = lines.map((str, i) => ({
    str,
    hasEOL: true,
    height: 11,
    transform: [1, 0, 0, 1, 80, 300 - i * 14],
  }));
  expect(pdfRubricParagraphs(items)).toEqual([
    "Rubric:",
    "+ 1 mark for each:",
    "• First criterion",
    "• Second criterion continued on next line",
    "+0: No answer or entirely incorrect.",
  ]);
});
it("does not repeatedly flag an already retired option on unrelated edits", () => {
  const retired = saveCategories(exam, { q: [] }, [], "Retired");
  expect(affectedMarks(retired, { q: [] })).toEqual([]);
});

it("merges repeated scores without losing descriptions, identities, or mutating the source", () => {
  const grouped = groupCategories(exam.categories!.q);
  expect(grouped).toHaveLength(1);
  expect(grouped[0].description).toBe("Correct\n\nAnother valid approach");
  expect(grouped[0].mergedIds).toContain("other");
  expect(exam.categories!.q).toHaveLength(2);
  expect(groupCategories(grouped)).toEqual(grouped);
});
it("a pure merge keeps marks unchanged and a later edit updates both original option IDs", () => {
  const grouped = groupCategoryMap(exam.categories);
  const merged = saveCategories(exam, grouped, [], "");
  expect(merged.marks?.q.s.score).toBe(2);
  expect(merged.marks?.q.t.score).toBe(2);
  expect(merged.marks?.q.t.categoryId).toBe("yes");
  const draft = groupCategoryMap(merged.categories);
  draft.q[0].score = 1;
  const next = saveCategories(merged, draft, [], "Updated score");
  expect(next.marks?.q.s.score).toBe(1);
  expect(next.marks?.q.t.score).toBe(1);
});
