import { groupCategoryMap, matchesCategory } from "./rubricScores";
import type { ExamRecord, RubricCategory } from "../models/exams";
export type CategoryMap = Record<string, RubricCategory[]>;

// A rubric is linked by the stable Canvas question ID, never its display label.
export function validateCategories(exam: ExamRecord, draft: CategoryMap) {
  for (const [id, categories] of Object.entries(draft)) {
    const q = exam.answers?.preview.questions.find(
      (q) => q.id === id && !q.instruction,
    );
    if (!q)
      throw new Error("A rubric refers to a question no longer in this exam.");
    if (categories.length > 100)
      throw new Error("Use at most 100 options per question.");
    const ids = new Set<string>();
    for (const c of categories) {
      if (!c.id || ids.has(c.id))
        throw new Error("Each option needs a unique ID.");
      ids.add(c.id);
      if (
        !Number.isFinite(c.score) ||
        c.score < 0 ||
        c.score > q.maxMark ||
        Math.abs(c.score * 100 - Math.round(c.score * 100)) > 1e-8
      )
        throw new Error(
          `Question ${id}: enter a score from 0 to ${q.maxMark}, with at most two decimal places.`,
        );
      if (!c.description.trim() || c.description.length > 10000)
        throw new Error(
          `Question ${id}: every option needs a description of 1–10000 characters.`,
        );
    }
  }
}

export function affectedMarks(exam: ExamRecord, draft: CategoryMap) {
  draft = groupCategoryMap(draft);
  return Object.entries(exam.marks ?? {}).flatMap(([questionId, marks]) =>
    Object.entries(marks).flatMap(([studentId, mark]) => {
      const category = draft[questionId]?.find((c) =>
        matchesCategory(c, mark.categoryId),
      );
      const previous = exam.categories?.[questionId]?.find((c) =>
        matchesCategory(c, mark.categoryId),
      );
      return (category ? category.score !== mark.score : !!previous)
        ? [
            {
              questionId,
              studentId,
              before: mark.score,
              after: category?.score,
            },
          ]
        : [];
    }),
  );
}

export function saveCategories(
  exam: ExamRecord,
  draft: CategoryMap,
  automatic: string[],
  reason: string,
): ExamRecord {
  validateCategories(exam, draft);
  draft = groupCategoryMap(draft);
  validateCategories(exam, draft);
  const affected = affectedMarks(exam, draft);
  if (affected.length && !reason.trim())
    throw new Error(
      "Explain the change before saving a rubric that affects confirmed marks.",
    );
  // Deleted options never guess a replacement category. Their previous marks survive.
  const scoreChanges = affected
    .filter((x) => x.after !== undefined)
    .map((x) => ({ ...x, after: x.after! }));
  const marks = Object.fromEntries(
    Object.entries(exam.marks ?? {}).map(([qid, records]) => [
      qid,
      Object.fromEntries(
        Object.entries(records).map(([sid, mark]) => {
          const previous = exam.categories?.[qid]?.find((c) =>
            matchesCategory(c, mark.categoryId),
          );
          const changed = scoreChanges.find(
            (x) => x.questionId === qid && x.studentId === sid,
          );
          const current = draft[qid]?.find((c) =>
            matchesCategory(c, mark.categoryId),
          );
          return [
            sid,
            {
              ...mark,
              ...(current ? { categoryId: current.id } : {}),
              categoryDescription: changed
                ? current?.description
                : (mark.categoryDescription ?? previous?.description),
              ...(changed ? { score: changed.after } : {}),
            },
          ];
        }),
      ),
    ]),
  );
  return {
    ...exam,
    categories: structuredClone(draft),
    autoMarkedQuestionIds: [...automatic],
    marks,
    rubricChanges: [
      ...(exam.rubricChanges ?? []),
      {
        at: new Date().toISOString(),
        reason: reason.trim() || "Rubric options updated",
        updatedMarks: scoreChanges.length,
        before: structuredClone(exam.categories ?? {}),
        after: structuredClone(draft),
        scoreChanges,
      },
    ],
  };
}
