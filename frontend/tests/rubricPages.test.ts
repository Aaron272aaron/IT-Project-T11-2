import { it, expect } from "vitest";
import { validRange, rubricQuestions } from "../src/utils/rubricPages";
it("accepts a single page or an inclusive page range", () => {
  expect(validRange({ start: 2, end: 2 }, 3)).toBe(true);
  expect(validRange({ start: 1, end: 3 }, 3)).toBe(true);
});
it("rejects fractions, missing bounds, reversed ranges and pages outside the document", () => {
  for (const [start, end] of [
    [0, 1],
    [1, 4],
    [2, 1],
    [1.5, 2],
    [1, NaN],
  ])
    expect(validRange({ start, end }, 3)).toBe(false);
});
it("keeps Canvas IDs separate from demo IDs and excludes section introductions", () => {
  const rows = rubricQuestions({
    id: "final",
    title: "Final",
    description: "",
    answers: {
      name: "a.csv",
      uploadedAt: "now",
      preview: {
        students: [],
        issues: [],
        questions: [
          {
            id: "1",
            text: "Real question",
            maxMark: 2,
            instruction: false,
            column: 5,
          },
          {
            id: "2",
            text: "Instructions",
            maxMark: 0,
            instruction: true,
            column: 3,
          },
        ],
      },
    },
  });
  expect(rows).toHaveLength(7);
  expect(rows.some((q) => q.key === "demo:1")).toBe(true);
  expect(rows.some((q) => q.key === "canvas:1")).toBe(true);
  expect(rows.some((q) => q.key === "canvas:2")).toBe(false);
});
