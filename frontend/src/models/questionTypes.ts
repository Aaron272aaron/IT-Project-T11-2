import type { ExamRecord } from "./exams";

// These seven question types follow Parts 1–7 of the supplied exam.
// Question types describe the task; rubric categories describe the awarded score.
export const QUESTION_TYPES = [
  { id: "expression-output", label: "Expression output" },
  { id: "assignment-statement", label: "Single assignment statement" },
  { id: "multiple-choice", label: "Multiple choice" },
  { id: "code-completion", label: "Code completion" },
  { id: "debugging", label: "Debugging" },
  { id: "coding", label: "Coding questions" },
  { id: "short-answer", label: "Short answer" },
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number]["id"] | "unassigned";

// Stable source IDs provide defaults for older sample sessions without resetting user edits.
const SAMPLE_TYPES: Record<string, QuestionType> = {
  "3081158": "expression-output",
  "3081159": "expression-output",
  "3081160": "expression-output",
  "3081161": "expression-output",
  "3081162": "expression-output",
  "3081163": "expression-output",
  "3081164": "expression-output",
  "3081165": "expression-output",
  "3081166": "expression-output",
  "3081168": "assignment-statement",
  "3081169": "assignment-statement",
  "3081170": "assignment-statement",
  "3081171": "assignment-statement",
  "3081173": "multiple-choice",
  "3081174": "multiple-choice",
  "3081175": "multiple-choice",
  "3081176": "multiple-choice",
  "3081178": "code-completion",
  "3081179": "code-completion",
  "3081180": "code-completion",
  "3081181": "code-completion",
  "3081182": "code-completion",
  "3081184": "debugging",
  "3081185": "debugging",
  "3081186": "debugging",
  "3081187": "debugging",
  "3081188": "debugging",
  "3081189": "debugging",
  "3081190": "debugging",
  "3081191": "debugging",
  "3081192": "debugging",
  "3081194": "coding",
  "3081195": "coding",
  "3081196": "coding",
  "3081198": "short-answer",
  "3081199": "short-answer",
  "3081200": "short-answer",
};
export function questionType(
  exam: ExamRecord,
  questionId: string,
): QuestionType {
  const saved = exam.questionTypes?.[questionId];
  if (saved === "unassigned" || QUESTION_TYPES.some((t) => t.id === saved))
    return saved!;
  return exam.sampleVersion
    ? (SAMPLE_TYPES[questionId] ?? "unassigned")
    : "unassigned";
}
export function questionTypeLabel(
  exam: ExamRecord,
  questionId: string,
): string {
  return (
    QUESTION_TYPES.find((t) => t.id === questionType(exam, questionId))
      ?.label ?? "Unassigned"
  );
}
