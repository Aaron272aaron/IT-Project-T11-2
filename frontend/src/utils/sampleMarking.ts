import { groupCategories, matchesCategory } from "./rubricScores";
import type { ExamRecord } from "../models/exams";

// One human-selected score applies to the whole answer. The CSV source score is never a confirmation.
export function confirmSampleMark(
  exam: ExamRecord,
  questionId: string,
  studentId: string,
  categoryId: string,
  comment: string,
): ExamRecord {
  const question = exam.answers?.preview.questions.find(
    (q) => q.id === questionId && !q.instruction,
  );
  const student = exam.answers?.preview.students.find(
    (s) => s.id === studentId,
  );
  if (!question || !student?.answers.some((a) => a.questionId === questionId))
    throw new Error("The original response no longer exists.");
  if (exam.autoMarkedQuestionIds?.includes(questionId))
    throw new Error(
      "Switch this question to manual marking before confirming.",
    );
  const category = groupCategories(exam.categories?.[questionId] ?? []).find(
    (c) => matchesCategory(c, categoryId),
  );
  if (!category) throw new Error("Select a rubric category before confirming.");
  const score = category.score;
  if (
    !Number.isFinite(score) ||
    score < 0 ||
    score > question.maxMark ||
    Math.abs(score * 100 - Math.round(score * 100)) > 1e-8
  )
    throw new Error(
      `Enter a score from 0 to ${question.maxMark}, with at most two decimal places.`,
    );
  return {
    ...exam,
    marks: {
      ...exam.marks,
      [questionId]: {
        ...exam.marks?.[questionId],
        [studentId]: {
          score,
          categoryId: category.id,
          categoryDescription: category.description,
          comment,
          confirmedAt: new Date().toISOString(),
        },
      },
    },
  };
}

// Count only current manual questions and current students; source-review records are excluded.
export function confirmedResponseCount(exam?: ExamRecord): number {
  const studentIds = new Set(
    exam?.answers?.preview.students.map((s) => s.id) ?? [],
  );
  return (exam?.answers?.preview.questions ?? [])
    .filter(
      (q) => !q.instruction && !exam?.autoMarkedQuestionIds?.includes(q.id),
    )
    .reduce(
      (count, q) =>
        count +
        Object.keys(exam?.marks?.[q.id] ?? {}).filter((id) =>
          studentIds.has(id),
        ).length,
      0,
    );
}
