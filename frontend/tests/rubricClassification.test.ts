import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { applyCodingSuggestions, isCodingRubric } from "../src/utils/rubricClassification";
import type { ExamRecord } from "../src/models/exams";
it("recognizes the guide heading including joined Word paragraphs, not other parts", () => {
  expect(isCodingRubric("Part 6 (22 marks) - Python functionsThese sub-questions required writing")).toBe(true);
  expect(isCodingRubric("Part 6 (22 marks) – Python functions")).toBe(true);
  expect(isCodingRubric("Part 5 (10 marks) - debug a Python function")).toBe(false);
  expect(isCodingRubric("Part 7 - Python functions")).toBe(false);
});
it("fills only valid unassigned questions without mutating marks or manual types", () => {
  const exam = JSON.parse(readFileSync("public/demo/sample-exam.json", "utf8")) as ExamRecord;
  delete exam.sampleVersion;
  exam.questionTypes = { "3081195": "debugging" };
  const next = applyCodingSuggestions(exam, ["3081194", "3081195", "3081196", "missing"]);
  expect(next.questionTypes).toEqual({ "3081194": "coding", "3081195": "debugging", "3081196": "coding" });
  expect(exam.questionTypes).toEqual({ "3081195": "debugging" });
  expect(next.marks).toBe(exam.marks);
  expect(next.categories).toBe(exam.categories);
});
