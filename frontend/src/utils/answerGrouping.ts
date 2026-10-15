import type { AnswerGroup } from "../api/answerGroups";
import { groupingRows, answerGroupKey } from "../api/answerGroups";
import type { ExamRecord } from "../models/exams";
import { questionType } from "../models/questionTypes";
import { confirmSampleMark } from "./sampleMarking";
import { questionLockOwner, submissionLockOwner } from "./submissionLocks";

export function confirmGroupMark(
  exam: ExamRecord,
  questionId: string,
  group: AnswerGroup,
  spaces: string[],
  categoryId: string,
  comment: string,
  marker: string,
): ExamRecord {
  const type = questionType(exam, questionId);
  // Keep the shared processing utility compatible with older short-answer groups.
  // The marking UI offers grouping only for expression-output questions.
  if (type !== "short-answer" && type !== "expression-output")
    throw new Error(
      "Group marks are only available for short-answer and expression-output questions.",
    );
  const owner = questionLockOwner(exam, questionId);
  if (owner)
    throw new Error(
      `This question is locked by ${owner}. Open another question.`,
    );
  const key = answerGroupKey(group.answer, type, spaces);
  const expected = groupingRows(exam, questionId).filter(
    (row) => answerGroupKey(row.answer, type, spaces) === key,
  );
  const members = new Map(
    group.students.map((member) => [member.student_id, member]),
  );
  if (
    !expected.length ||
    members.size !== expected.length ||
    group.count !== expected.length ||
    group.students.length !== expected.length ||
    expected.some(
      (row) =>
        members.get(row.student_id)?.answer !== row.answer ||
        members.get(row.student_id)?.submission_id !== row.submission_id,
    )
  )
    throw new Error(
      "This group has changed. Refresh its members before marking.",
    );
  const available = expected.filter(
    (row) => !submissionLockOwner(exam, questionId, row.student_id),
  );
  if (!available.length)
    throw new Error("All responses in this group are locked.");
  // Validate the selected category and maximum with the same rules as an individual mark.
  const checked = confirmSampleMark(
    exam,
    questionId,
    available[0].student_id,
    categoryId,
    comment,
  );
  const decision = checked.marks![questionId][available[0].student_id];
  const marks = { ...exam.marks?.[questionId] };
  for (const row of available) marks[row.student_id] = { ...decision };
  return {
    ...exam,
    marks: { ...exam.marks, [questionId]: marks },
    groupMarkHistory: [
      ...(exam.groupMarkHistory ?? []),
      {
        groupId: group.group_id,
        questionId,
        studentIds: available.map((row) => row.student_id),
        marker,
        at: decision.confirmedAt,
        score: decision.score,
        categoryId: decision.categoryId!,
        comment,
        previousMarks: Object.fromEntries(
          available.map((row) => [
            row.student_id,
            exam.marks?.[questionId]?.[row.student_id]?.score ?? null,
          ]),
        ),
      },
    ],
  };
}
