import { describe, expect, it } from "vitest";
import { examsFor, updateExam, type ExamRecord } from "../src/models/exams";

// A workspace switch must not expose another workspace's files, even when
// their demo exam IDs are the same. Updating a rubric must keep its answers.
describe("exam file ownership", () => {
  it("keeps existing demos when creating an exam in an older session", () => {
    const exam: ExamRecord = { id: "new", title: "New exam", description: "" };
    expect(
      examsFor(updateExam({}, "comp10001", exam), "comp10001").map((e) => e.id),
    ).toEqual(["final", "midterm", "practice", "new"]);
  });
  it("isolates exams between workspaces and preserves unrelated exams", () => {
    const first: ExamRecord = { id: "a", title: "A", description: "" };
    const second: ExamRecord = { id: "b", title: "B", description: "" };
    const before = updateExam(updateExam({}, "w1", first), "w1", second);
    const next = updateExam(before, "w1", {
      ...first,
      rubric: {
        name: "guide.pdf",
        dataUrl: "data:application/octet-stream;base64,AA==",
        size: 1,
        uploadedAt: "now",
      },
    });
    expect(examsFor(next, "w1").find((e) => e.id === "b")).toBe(second);
    expect(examsFor(next, "w2").some((e) => e.id === "a")).toBe(false);
    expect(
      examsFor(before, "w1").find((e) => e.id === "a")?.rubric,
    ).toBeUndefined();
  });
});
