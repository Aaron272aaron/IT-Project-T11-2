import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  EXAM_STORAGE_KEY,
  persistExams,
  restoreExams,
  type ExamRegistry,
} from "../src/models/exams";
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
let local: ReturnType<typeof storage>, session: ReturnType<typeof storage>;
const registry: ExamRegistry = {
  workspace: [
    {
      id: "exam",
      title: "Synthetic",
      description: "",
      answerGrouping: {
        q: {
          signature: "digest",
          unicodeSpaces: [],
          generatedAt: "now",
          groups: [{ id: "g", studentIds: ["s"] }],
        },
      },
      marks: { q: { s: { score: 2, comment: "Checked", confirmedAt: "now" } } },
    },
  ],
};
beforeEach(() => {
  local = storage();
  session = storage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
});
afterEach(() => vi.unstubAllGlobals());
it("restores saved groups and marks after the session mirror disappears", () => {
  persistExams(registry);
  session.removeItem(EXAM_STORAGE_KEY);
  expect(restoreExams()).toEqual(registry);
});
it("upgrades older session-only exams without discarding their data", () => {
  session.setItem(EXAM_STORAGE_KEY, JSON.stringify(registry));
  expect(restoreExams()).toEqual(registry);
});
it("uses the session mirror when durable storage is corrupted", () => {
  local.setItem(EXAM_STORAGE_KEY, "broken JSON");
  session.setItem(EXAM_STORAGE_KEY, JSON.stringify(registry));
  expect(restoreExams()).toEqual(registry);
});
it("does not publish changed data if either storage write fails", () => {
  persistExams(registry);
  const changed = { ...registry, new: [] };
  local.setItem.mockImplementationOnce(() => {
    throw new Error("Full");
  });
  expect(() => persistExams(changed)).toThrow();
  expect(restoreExams()).toEqual(registry);
  session.setItem.mockImplementationOnce(() => {
    throw new Error("Full");
  });
  expect(() => persistExams(changed)).toThrow();
  expect(restoreExams()).toEqual(registry);
});
