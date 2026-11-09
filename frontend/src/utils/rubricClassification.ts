import type { ExamRecord } from "../models/exams";
import { questionType } from "../models/questionTypes";

// Only the standard guide's function-writing section identifies Coding.
export function isCodingRubric(title: string): boolean {
  return /^Part\s+6\b[^\n]*?[-–—]\s*Python functions(?:\b|These\b)/i.test(title);
}

export function applyCodingSuggestions(exam: ExamRecord, ids: string[]): ExamRecord {
  const questionTypes = { ...exam.questionTypes };
  const valid = new Set(exam.answers?.preview.questions.filter(q => !q.instruction).map(q => q.id));
  for (const id of ids) {
    if (valid.has(id) && questionType(exam, id) === "unassigned") questionTypes[id] = "coding";
  }
  return { ...exam, questionTypes };
}
