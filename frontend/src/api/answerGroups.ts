import { apiFetch } from "./auth";
import type { ExamRecord } from "../models/exams";
import {
  questionType,
  supportsAnswerGrouping,
  type QuestionType,
} from "../models/questionTypes";

export type GroupMember = {
  submission_id: string;
  student_id: string;
  answer: string;
};
export type AnswerGroup = {
  group_id: string;
  answer: string;
  count: number;
  students: GroupMember[];
};
export type GroupSnapshot = {
  signature: string;
  unicodeSpaces: string[];
  generatedAt: string;
  groups: { id: string; studentIds: string[] }[];
};
export const SPACE_RULES = [
  { char: "\u00a0", label: "No-break space (U+00A0)" },
  { char: "\u202f", label: "Narrow no-break space (U+202F)" },
  { char: "\u2009", label: "Thin space (U+2009)" },
  { char: "\u2002", label: "En space (U+2002)" },
  { char: "\u2003", label: "Em space (U+2003)" },
  { char: "\u3000", label: "Ideographic space (U+3000)" },
];
export function shortAnswerKey(answer: string, spaces: string[] = []) {
  if (spaces.some((char) => !SPACE_RULES.some((rule) => rule.char === char)))
    throw new Error("Unsupported space replacement.");
  const ignored = new Set([" ", ...spaces]);
  return Array.from(answer)
    .filter((char) => !ignored.has(char))
    .join("");
}
export function answerGroupKey(
  answer: string,
  type: QuestionType,
  spaces: string[] = [],
) {
  if (type === "expression-output") {
    if (spaces.length)
      throw new Error("Expression outputs preserve all spaces.");
    return answer;
  }
  if (type === "short-answer") return shortAnswerKey(answer, spaces);
  throw new Error(
    "Grouping is only available for short-answer and expression-output questions.",
  );
}
export function groupingRows(exam: ExamRecord, questionId: string) {
  return (exam.answers?.preview.students ?? []).flatMap((student) => {
    const answer = student.answers.find(
      (item) => item.questionId === questionId,
    );
    return answer
      ? [
          {
            submission_id: student.id,
            student_id: student.id,
            question_id: questionId,
            answer: answer.original,
          },
        ]
      : [];
  });
}
export async function groupingSignature(
  exam: ExamRecord,
  questionId: string,
  spaces: string[],
) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([
        questionId,
        questionType(exam, questionId),
        [...spaces].sort(),
        groupingRows(exam, questionId),
      ]),
    ),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function validateGroups(
  value: unknown,
  rows: ReturnType<typeof groupingRows>,
  spaces: string[],
  type: QuestionType = "short-answer",
): AnswerGroup[] {
  const source = new Map(rows.map((row) => [row.submission_id, row]));
  if (source.size !== rows.length || !Array.isArray(value))
    throw new Error("Invalid answer-group membership. Refresh and retry.");
  const seen = new Set<string>();
  const groupIds = new Set<string>();
  const keys = new Set<string>();
  for (const group of value as AnswerGroup[]) {
    if (
      !group ||
      typeof group.group_id !== "string" ||
      !/^group-[a-f0-9]{20}$/.test(group.group_id) ||
      groupIds.has(group.group_id) ||
      !Array.isArray(group.students) ||
      group.count !== group.students.length ||
      !group.count ||
      typeof group.answer !== "string"
    )
      throw new Error("Invalid answer-group result. Refresh and retry.");
    groupIds.add(group.group_id);
    const key = answerGroupKey(group.answer, type, spaces);
    if (keys.has(key))
      throw new Error(
        "Matching answers were split unexpectedly. Retry grouping.",
      );
    keys.add(key);
    for (const member of group.students) {
      const original = source.get(member?.submission_id);
      if (
        !original ||
        seen.has(member.submission_id) ||
        original.student_id !== member.student_id ||
        original.answer !== member.answer ||
        answerGroupKey(member.answer, type, spaces) !== key
      )
        throw new Error(
          "Answer groups do not match these responses. Refresh and retry.",
        );
      seen.add(member.submission_id);
    }
    if (!group.students.some((member) => member.answer === group.answer))
      throw new Error("Invalid representative answer.");
  }
  if (seen.size !== rows.length)
    throw new Error(
      "Some responses are missing from the groups. Retry grouping.",
    );
  return value as AnswerGroup[];
}
export function restoreGroups(
  snapshot: GroupSnapshot,
  rows: ReturnType<typeof groupingRows>,
  type: QuestionType = "short-answer",
) {
  const originals = new Map(rows.map((row) => [row.student_id, row]));
  return validateGroups(
    snapshot.groups.map((group) => {
      const students = group.studentIds
        .map((id) => originals.get(id))
        .filter((row) => !!row);
      return {
        group_id: group.id,
        count: group.studentIds.length,
        answer: students[0]?.answer ?? "",
        students,
      };
    }),
    rows,
    snapshot.unicodeSpaces,
    type,
  );
}
export async function requestAnswerGroups(
  exam: ExamRecord,
  questionId: string,
  spaces: string[],
  signal: AbortSignal,
) {
  const type = questionType(exam, questionId);
  if (!supportsAnswerGrouping(type))
    throw new Error(
      "Grouping is only available for expression-output questions.",
    );
  const rows = groupingRows(exam, questionId);
  let response: Response;
  try {
    response = await apiFetch("/api/answer-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_type: type,
        unicode_spaces: spaces,
        answers: rows,
      }),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "Cannot reach answer grouping. Start the app with npm run dev, then retry. Individual marking remains available.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.message ??
        "Grouping could not finish. Retry or mark students individually.",
    );
  if (
    data?.schema_version !== 1 ||
    data.submission_count !== rows.length ||
    data.group_count !== data.groups?.length
  )
    throw new Error("Unexpected answer-group result. Retry grouping.");
  return validateGroups(data.groups, rows, spaces, type);
}
