import { describe, it, expect } from "vitest";
import { initialWorkspace, type Answer } from "../src/models/domain";
import {
  categoriesFor,
  saveCategoryMark,
  previewCategoryScores,
  applyCategoryScores,
  studentTotals,
} from "../src/utils/rubric";
const base: Answer = {
  id: "a",
  question: 1,
  original: "3",
  group: "A",
  test: "Not run",
};
const answers = [
  {
    ...base,
    categoryId: "partial",
    mark: 2.5,
    markAtSelection: 2.5,
    comment: "Keep this",
  },
  { ...base, id: "b", categoryId: "partial", mark: 2.5, markAtSelection: 2.5 },
  { ...base, id: "c", categoryId: "correct", mark: 5 },
  { ...base, id: "old", mark: 4 },
  { ...base, id: "pending" },
  { ...base, id: "a", question: 2, categoryId: "partial", mark: 2.5 },
];
const proposed = { correct: 5, partial: 3, incorrect: 0 };
describe("whole-answer rubric marking", () => {
  it("requires a known category and records its score and provenance", () => {
    expect(() =>
      saveCategoryMark([base], initialWorkspace, 1, ["a"], "", ""),
    ).toThrow(/Choose/);
    const [result] = saveCategoryMark(
      [base],
      initialWorkspace,
      1,
      ["a"],
      "partial",
      "review",
    );
    expect(result).toMatchObject({
      categoryId: "partial",
      mark: 2.5,
      markAtSelection: 2.5,
      original: "3",
    });
  });
  it("supports a zero category without treating it as missing", () => {
    expect(
      saveCategoryMark([base], initialWorkspace, 1, ["a"], "incorrect", "")[0]
        .mark,
    ).toBe(0);
  });
  it("honours changed category values for future marking", () => {
    const w = { ...initialWorkspace, rubricScores: { 1: proposed } };
    expect(categoriesFor(1, w)[1].score).toBe(3);
    expect(saveCategoryMark([base], w, 1, ["a"], "partial", "")[0].mark).toBe(
      3,
    );
  });
  it("rejects nonexistent and locked answers", () => {
    expect(() =>
      saveCategoryMark([base], initialWorkspace, 1, ["missing"], "correct", ""),
    ).toThrow();
    expect(() =>
      saveCategoryMark(
        [{ ...base, locked: "Sam" }],
        initialWorkspace,
        1,
        ["a"],
        "correct",
        "",
      ),
    ).toThrow(/locked/);
  });
});
describe("coordinator moderation", () => {
  it("preview changes only classified, marked answers for the chosen question", () => {
    const preview = previewCategoryScores(
      initialWorkspace,
      answers,
      1,
      proposed,
    );
    expect(preview.affected).toEqual([
      { student: "a", before: 2.5, after: 3 },
      { student: "b", before: 2.5, after: 3 },
    ]);
    expect(preview.legacyCount).toBe(1);
    expect(preview.answers.slice(2)).toEqual(answers.slice(2));
    expect(answers[0].mark).toBe(2.5);
    expect(preview.answers[0]).toMatchObject({
      original: "3",
      categoryId: "partial",
      markAtSelection: 2.5,
      comment: "Keep this",
    });
  });
  it("requires coordinator and a reason, and records before/after audit", () => {
    expect(() =>
      applyCategoryScores(
        initialWorkspace,
        answers,
        1,
        proposed,
        "reason",
        "member-1",
      ),
    ).toThrow(/coordinator/);
    expect(() =>
      applyCategoryScores(initialWorkspace, answers, 1, proposed, " ", "me"),
    ).toThrow(/reason/);
    const result = applyCategoryScores(
      initialWorkspace,
      answers,
      1,
      proposed,
      "Partial credit review",
      "me",
    );
    expect(result.workspace.rubricScores?.[1].partial).toBe(3);
    expect(result.record.changes).toEqual([
      {
        categoryId: "partial",
        label: "Partially correct",
        before: 2.5,
        after: 3,
      },
    ]);
    expect(result.record.affected).toHaveLength(2);
    expect(initialWorkspace.rubricScores).toBeUndefined();
  });
  it("rejects out of range, nonfinite and overprecise scores", () => {
    for (const score of [-1, 6, NaN, Infinity, 2.345])
      expect(() =>
        previewCategoryScores(initialWorkspace, answers, 1, {
          ...proposed,
          partial: score,
        }),
      ).toThrow();
  });
  it("blocks locked affected answers and no-op submissions", () => {
    expect(() =>
      applyCategoryScores(
        initialWorkspace,
        [{ ...answers[0], locked: "Sam" }],
        1,
        proposed,
        "reason",
        "me",
      ),
    ).toThrow(/locked/);
    expect(() =>
      applyCategoryScores(
        initialWorkspace,
        answers,
        1,
        { ...proposed, partial: 2.5 },
        "reason",
        "me",
      ),
    ).toThrow(/at least/);
  });
  it("recalculates totals and repeated changes from current scores, without accumulating offsets", () => {
    const first = applyCategoryScores(
      initialWorkspace,
      answers,
      1,
      proposed,
      "first",
      "me",
    );
    const second = applyCategoryScores(
      first.workspace,
      first.answers,
      1,
      { ...proposed, partial: 4 },
      "second",
      "me",
    );
    expect(second.answers[0].mark).toBe(4);
    expect(studentTotals(second.answers).find((s) => s.id === "a")?.total).toBe(
      6.5,
    );
    expect(second.record.changes[0].before).toBe(3);
    expect(second.workspace.moderationHistory).toHaveLength(2);
  });
});
