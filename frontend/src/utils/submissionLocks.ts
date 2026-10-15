import type { ExamRecord } from "../models/exams";
import { questionType, supportsAnswerGrouping } from "../models/questionTypes";

export function questionLockOwner(
  exam: ExamRecord,
  questionId: string,
): string | undefined {
  if (!supportsAnswerGrouping(questionType(exam, questionId))) return undefined;
  return exam.questionLocks?.[questionId];
}

export function submissionLockOwner(
  exam: ExamRecord,
  questionId: string,
  studentId: string,
): string | undefined {
  if (supportsAnswerGrouping(questionType(exam, questionId))) return undefined;
  return exam.submissionLocks?.[questionId]?.[studentId];
}
