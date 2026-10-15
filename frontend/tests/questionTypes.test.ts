import { it, expect } from "vitest";
import type { ExamRecord } from "../src/models/exams";
import {
  questionType,
  supportsAnswerGrouping,
} from "../src/models/questionTypes";
const sample: ExamRecord = {
  id: "final",
  title: "Sample",
  description: "",
  sampleVersion: 1,
};
it("offers grouping only for expression outputs, not short answers", () => {
  expect(supportsAnswerGrouping("expression-output")).toBe(true);
  expect(supportsAnswerGrouping("short-answer")).toBe(false);
  expect(supportsAnswerGrouping("coding")).toBe(false);
});
it("restores old sample defaults without guessing types in unrelated exams", () => {
  expect(questionType(sample, "3081194")).toBe("coding");
  expect(questionType(sample, "3081158")).toBe("expression-output");
  expect(questionType({ ...sample, sampleVersion: undefined }, "3081194")).toBe(
    "unassigned",
  );
  expect(questionType(sample, "new-question")).toBe("unassigned");
});
it("keeps explicit coordinator changes and unassignment instead of reapplying defaults", () => {
  expect(
    questionType(
      { ...sample, questionTypes: { "3081194": "short-answer" } },
      "3081194",
    ),
  ).toBe("short-answer");
  expect(
    questionType(
      { ...sample, questionTypes: { "3081194": "unassigned" } },
      "3081194",
    ),
  ).toBe("unassigned");
});
