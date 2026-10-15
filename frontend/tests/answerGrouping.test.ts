import { describe, expect, it } from "vitest";
import {
  shortAnswerKey,
  answerGroupKey,
  validateGroups,
  restoreGroups,
  groupingRows,
  type AnswerGroup,
} from "../src/api/answerGroups";
import { confirmGroupMark } from "../src/utils/answerGrouping";
import type { ExamRecord } from "../src/models/exams";
const exam: ExamRecord = {
  id: "e",
  title: "Synthetic",
  description: "",
  questionTypes: { q: "short-answer" },
  categories: { q: [{ id: "full", score: 2, description: "Correct" }] },
  answers: {
    name: "synthetic.csv",
    uploadedAt: "now",
    preview: {
      issues: [],
      questions: [
        { id: "q", text: "Explain", maxMark: 2, instruction: false, column: 1 },
      ],
      students: ["a", "b", "c"].map((id, index) => ({
        id,
        canvasId: id,
        attempt: "1",
        answers: [
          {
            questionId: "q",
            original: ["blue sky", "blue  sky ", "red sky"][index],
            sourceScore: "0",
            blank: false,
            unicodeReview: false,
          },
        ],
      })),
    },
  },
  marks: {
    q: {
      a: {
        score: 1,
        categoryId: "old",
        comment: "Individual",
        confirmedAt: "before",
      },
    },
  },
};
const group: AnswerGroup = {
  group_id: "group-00000000000000000001",
  answer: "blue sky",
  count: 2,
  students: groupingRows(exam, "q").slice(0, 2),
};
const other: AnswerGroup = {
  group_id: "group-00000000000000000002",
  answer: "red sky",
  count: 1,
  students: groupingRows(exam, "q").slice(2),
};
describe("exact answer groups and human batch marks", () => {
  it("groups identical expression outputs without collapsing distinct whitespace or values", () => {
    const outputExam: ExamRecord = {
      ...exam,
      questionTypes: { q: "expression-output" },
    };
    const rows = groupingRows(outputExam, "q");
    expect(answerGroupKey("'a b'", "expression-output")).not.toBe(
      answerGroupKey("'ab'", "expression-output"),
    );
    expect(answerGroupKey("1", "expression-output")).not.toBe(
      answerGroupKey("1.0", "expression-output"),
    );
    expect(() => answerGroupKey("x", "expression-output", ["\u00a0"])).toThrow(
      "preserve",
    );
    expect(() =>
      validateGroups([group, other], rows, [], "expression-output"),
    ).toThrow();
    expect(() =>
      confirmGroupMark(outputExam, "q", group, [], "full", "", "Tutor"),
    ).toThrow("changed");
    const exactGroup = { ...group, count: 1, students: rows.slice(0, 1) };
    const next = confirmGroupMark(
      outputExam,
      "q",
      exactGroup,
      [],
      "full",
      "Reviewed output",
      "Tutor",
    );
    expect(next.marks?.q.a.score).toBe(2);
    expect(next.marks?.q.b).toBeUndefined();
    expect(next.answers).toBe(exam.answers);
  });

  it("ignores only approved spaces and preserves meaningful characters", () => {
    expect(shortAnswerKey("blue  sky ")).toBe(shortAnswerKey("bluesky"));
    for (const text of [
      "blue\tsky",
      "blue\nsky",
      "blue\u00a0sky",
      "Blue sky",
      "blue+sky",
    ])
      expect(shortAnswerKey(text)).not.toBe(shortAnswerKey("blue sky"));
    expect(shortAnswerKey("blue\u00a0sky", ["\u00a0"])).toBe(
      shortAnswerKey("blue sky"),
    );
    expect(() => shortAnswerKey("a+b", ["+"])).toThrow();
  });
  it("rejects missing, duplicated, incorrect and cross-group memberships", () => {
    expect(
      validateGroups([group, other], groupingRows(exam, "q"), []),
    ).toHaveLength(2);
    for (const groups of [
      [group],
      [group, group],
      [
        {
          ...group,
          students: [...group.students, other.students[0]],
          count: 3,
        },
      ],
    ])
      expect(() =>
        validateGroups(groups, groupingRows(exam, "q"), []),
      ).toThrow();
    expect(() =>
      validateGroups(
        [
          {
            ...group,
            students: group.students.map((member) => ({
              ...member,
              answer: "forged",
            })),
          },
          other,
        ],
        groupingRows(exam, "q"),
        [],
      ),
    ).toThrow();
  });
  it("reconstructs saved groups using original answers", () => {
    expect(
      restoreGroups(
        {
          signature: "hash",
          unicodeSpaces: [],
          generatedAt: "now",
          groups: [
            { id: group.group_id, studentIds: ["a", "b"] },
            { id: other.group_id, studentIds: ["c"] },
          ],
        },
        groupingRows(exam, "q"),
      )[0].students[1].answer,
    ).toBe("blue  sky ");
  });
  it("marks all selected members atomically, keeps other students and originals unchanged, and records replacements", () => {
    const next = confirmGroupMark(
      exam,
      "q",
      group,
      [],
      "full",
      "Reviewed",
      "Tutor",
    );
    expect(next.marks?.q.a.score).toBe(2);
    expect(next.marks?.q.b.score).toBe(2);
    expect(next.marks?.q.c).toBeUndefined();
    expect(next.answers).toBe(exam.answers);
    expect(exam.marks?.q.a.score).toBe(1);
    expect(next.groupMarkHistory?.[0]).toMatchObject({
      marker: "Tutor",
      studentIds: ["a", "b"],
      previousMarks: { a: 1, b: null },
    });
  });
  it("rejects stale groups, invalid categories and code questions before any mark changes", () => {
    expect(() =>
      confirmGroupMark(
        exam,
        "q",
        { ...group, students: group.students.slice(0, 1), count: 1 },
        [],
        "full",
        "",
        "Tutor",
      ),
    ).toThrow("changed");
    expect(() =>
      confirmGroupMark(exam, "q", group, [], "missing", "", "Tutor"),
    ).toThrow();
    expect(() =>
      confirmGroupMark(
        { ...exam, questionTypes: { q: "coding" } },
        "q",
        group,
        [],
        "full",
        "",
        "Tutor",
      ),
    ).toThrow("short-answer");
    expect(exam.marks?.q.b).toBeUndefined();
  });
  it("applies a 10,000-student mark without repeatedly copying the whole exam", () => {
    const students = Array.from({ length: 10_000 }, (_, index) => ({
      ...exam.answers!.preview.students[0],
      id: `s${index}`,
    }));
    const large = {
      ...exam,
      answers: {
        ...exam.answers!,
        preview: { ...exam.answers!.preview, students },
      },
    };
    const batch = {
      ...group,
      count: students.length,
      students: groupingRows(large, "q"),
    };
    expect(
      Object.keys(
        confirmGroupMark(large, "q", batch, [], "full", "", "Tutor").marks!.q,
      ),
    ).toHaveLength(10_001);
  });
});
