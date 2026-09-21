import { describe, it, expect } from "vitest";
import {
  validateCsv,
  sampleCsv,
  saveMarks,
  seedAnswers,
  groupAnswers,
  type Answer,
} from "../src/domain";
describe("CSV validation", () => {
  it("preserves quoted multiline code and commas", () => {
    const r = validateCsv(sampleCsv);
    expect(r.issues).toEqual([]);
    expect(r.answers).toHaveLength(3);
    expect(r.answers[1].original).toBe(
      "def clean_text(s):\n    return s.strip().lower()",
    );
    expect(r.answers[0].original).toContain("3, because");
  });
  it("rejects missing headers, invalid questions and duplicates", () => {
    expect(
      validateCsv("student_id,answer\na,3").issues.some((i) =>
        i.message.includes("question_id"),
      ),
    ).toBe(true);
    const r = validateCsv(
      "student_id,question_id,answer\na,9,hello\na,9,again\n,1,3",
    );
    expect(r.issues.some((i) => i.message.includes("Duplicate"))).toBe(true);
    expect(r.issues.some((i) => i.message.includes("1–6"))).toBe(true);
    expect(r.issues.some((i) => i.message.includes("Student ID"))).toBe(true);
  });
  it("rejects empty files and empty answers", () => {
    expect(validateCsv("").issues.length).toBeGreaterThan(0);
    expect(
      validateCsv("student_id,question_id,answer\na,1,").issues.some((i) =>
        i.message.includes("Answer is required"),
      ),
    ).toBe(true);
  });
  it("preserves significant whitespace in answers", () => {
    expect(
      validateCsv('student_id,question_id,answer\na,1," 3 "').answers[0]
        .original,
    ).toBe(" 3 ");
  });
});
describe("human marking", () => {
  it("changes only selected question/student and never original content", () => {
    const before = seedAnswers();
    const after = saveMarks(before, 1, ["demo001"], 4, "Reviewed");
    expect(
      after.find((a) => a.id === "demo001" && a.question === 1)?.mark,
    ).toBe(4);
    expect(
      before.find((a) => a.id === "demo001" && a.question === 1)?.mark,
    ).toBeUndefined();
    expect(after.map((a) => a.original)).toEqual(before.map((a) => a.original));
    expect(
      after.find((a) => a.id === "demo001" && a.question === 2)?.mark,
    ).toBeUndefined();
  });
  it("rejects out-of-range, NaN, empty selection and locked responses", () => {
    const a = seedAnswers();
    for (const mark of [-1, 6, NaN, Infinity])
      expect(() => saveMarks(a, 1, ["demo001"], mark, "")).toThrow();
    expect(() => saveMarks(a, 1, [], 1, "")).toThrow();
    expect(() => saveMarks(a, 1, ["demo003"], 1, "")).toThrow(/locked/);
  });
  it("groups only exact short answers within a question", () => {
    const base: Answer = {
      id: "a",
      question: 1,
      original: "3",
      group: "",
      test: "Not run",
    };
    const grouped = groupAnswers([
      base,
      { ...base, id: "b" },
      { ...base, id: "c", original: "3 " },
      { ...base, id: "d", question: 3, group: "—" },
    ]);
    expect(grouped[0].group).toBe(grouped[1].group);
    expect(grouped[0].group).not.toBe(grouped[2].group);
    expect(grouped[3].group).toBe("—");
  });
  it("demo passed function code has valid definition punctuation", () => {
    expect(
      seedAnswers()
        .filter((a) => a.question >= 5 && a.test === "Passed")
        .every((a) => a.original.split("\n")[0].endsWith(":")),
    ).toBe(true);
  });
});
