import type { QuestionType } from "./questionTypes";
import type { CanvasPreview } from "./canvasCsv";
import type { GroupSnapshot } from "../api/answerGroups";

// Exams belong to a workspace. Uploaded documents are references, not rules
// that can silently overwrite human-confirmed marks in the demo workflow.
export type ExamAttachment = {
  name: string;
  size: number;
  uploadedAt: string;
  dataUrl: string;
  // DOCX gets one PDF snapshot so everyone maps and views the same pagination.
  previewPdf?: string;
  pageCount?: number;
};
export type RubricCategory = {
  id: string;
  score: number;
  description: string;
  // Retain identities of merged options so historical marks remain linked.
  mergedIds?: string[];
};
export type RubricChange = {
  at: string;
  reason: string;
  updatedMarks: number;
  before: Record<string, RubricCategory[]>;
  after: Record<string, RubricCategory[]>;
  scoreChanges: {
    questionId: string;
    studentId: string;
    before: number;
    after: number;
  }[];
};
export type ExamRecord = {
  // Presentation locks for the marking examples; keyed by question and student.
  submissionLocks?: Record<string, Record<string, string>>;
  questionLocks?: Record<string, string>;
  demoMarkDistribution?: boolean;
  answerGrouping?: Record<string, GroupSnapshot>;
  groupMarkHistory?: {
    groupId: string;
    questionId: string;
    studentIds: string[];
    marker: string;
    at: string;
    score: number;
    categoryId: string;
    comment: string;
    previousMarks: Record<string, number | null>;
  }[];
  questionTypes?: Record<string, QuestionType>;
  rubricChanges?: RubricChange[];
  id: string;
  title: string;
  description: string;
  sampleVersion?: number;
  categories?: Record<string, RubricCategory[]>;
  autoMarkedQuestionIds?: string[];
  // Human confirmations are separate from immutable CSV source scores and answers.
  marks?: Record<
    string,
    Record<
      string,
      {
        score: number;
        categoryId?: string;
        // Snapshot keeps old decisions readable after editing or deleting an option.
        categoryDescription?: string;
        comment: string;
        confirmedAt: string;
      }
    >
  >;
  rubric?: ExamAttachment;
  rubricPages?: Record<string, { start: number; end: number }>;
  answers?: { name: string; uploadedAt: string; preview: CanvasPreview };
};
export type ExamRegistry = Record<string, ExamRecord[]>;
export const EXAM_STORAGE_KEY = "automarktic-exams-v1";

export function examsFor(
  registry: ExamRegistry,
  workspaceId: string,
): ExamRecord[] {
  // Older sessions have no exam registry yet. Keep existing demo routes usable.
  return (
    registry[workspaceId] ?? [
      {
        id: "final",
        title: "Final exam",
        description: "Six-question marking demo.",
      },
    ]
  );
}

export function updateExam(
  registry: ExamRegistry,
  workspaceId: string,
  exam: ExamRecord,
): ExamRegistry {
  const current = examsFor(registry, workspaceId);
  return {
    ...registry,
    [workspaceId]: current.some((item) => item.id === exam.id)
      ? current.map((item) => (item.id === exam.id ? exam : item))
      : [...current, exam],
  };
}

export function restoreExams(key = EXAM_STORAGE_KEY): ExamRegistry {
  for (const read of [
    () => localStorage.getItem(key),
    () => sessionStorage.getItem(key),
  ]) {
    try {
      const raw = read();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        Object.values(parsed).every(
          (items) =>
            Array.isArray(items) &&
            items.every(
              (item) =>
                item &&
                typeof item.id === "string" &&
                typeof item.title === "string" &&
                typeof item.description === "string",
            ),
        )
      )
        return parsed;
    } catch {
      /* Try the older session mirror if durable storage is invalid or blocked. */
    }
  }
  return {};
}

// Durable local storage restores exam answers, group rules and human marks after
// closing the app. Keep the older session mirror for existing integrations.
export function persistExams(registry: ExamRegistry, key = EXAM_STORAGE_KEY) {
  const previous = localStorage.getItem(key);
  const encoded = JSON.stringify(registry);
  localStorage.setItem(key, encoded);
  try {
    sessionStorage.setItem(key, encoded);
  } catch (error) {
    if (previous === null) localStorage.removeItem(key);
    else localStorage.setItem(key, previous);
    throw error;
  }
}
