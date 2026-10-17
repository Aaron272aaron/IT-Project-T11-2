import { expect, it } from "vitest";
import { parseDemoCsv } from "../src/demo/transport";
import { canvasExampleCsv } from "../src/models/canvasCsv";
it("demo CSV preserves quoted answers and multiline code", () => {
  const result = parseDemoCsv(canvasExampleCsv);
  expect(result.issues).toEqual([]);
  expect(result.students).toHaveLength(2);
  expect(
    result.students[0].answers.find((a) => a.questionId === "102")?.original,
  ).toBe("def example():\n    return 1");
  expect(
    result.students[0].answers.find((a) => a.questionId === "101")?.original,
  ).toContain(",");
});
it("demo CSV rejects unrelated files rather than substituting sample answers", () => {
  expect(parseDemoCsv("name,value\nhello,world").issues[0].severity).toBe(
    "error",
  );
});
