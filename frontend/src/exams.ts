import type { CanvasPreview } from "./canvasCsv";

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
export type ExamRecord = {
  id: string;
  title: string;
  description: string;
  sampleVersion?: number;
  categories?: Record<
    string,
    { id: string; score: number; description: string }[]
  >;
  autoMarkedQuestionIds?: string[];
  // Human confirmations are separate from immutable CSV source scores and answers.
  marks?: Record<
    string,
    Record<
      string,
      {
        score: number;
        categoryId?: string;
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
      ...(workspaceId === "comp10001"
        ? [
            {
              id: "midterm",
              title: "Mid-semester test",
              description: "Archived demo exam.",
            },
            {
              id: "practice",
              title: "Practice exam",
              description: "Draft demo exam.",
            },
          ]
        : []),
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

export function restoreExams(): ExamRegistry {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(EXAM_STORAGE_KEY) ?? "{}");
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
    /* Invalid or unavailable browser storage starts with demo exams. */
  }
  return {};
}
