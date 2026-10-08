import {
  questions,
  saveMarks,
  type Answer,
  type Workspace,
  type ModerationRecord,
} from "../models/domain";
export type RubricCategory = {
  id: string;
  label: string;
  description: string;
  score: number;
};
export function categoriesFor(
  question: number,
  workspace: Workspace,
): RubricCategory[] {
  const q = questions.find((q) => q.id === question);
  if (!q) throw new Error("Question not found.");
  return [
    {
      id: "correct",
      label: "Fully correct",
      description: "The whole answer meets the question requirements.",
      score: q.max,
    },
    {
      id: "partial",
      label: "Partially correct",
      description:
        "The answer shows relevant understanding but has errors or omissions.",
      score: q.max / 2,
    },
    {
      id: "incorrect",
      label: "Incorrect",
      description: "The answer does not meet the question requirements.",
      score: 0,
    },
  ].map((c) => ({
    ...c,
    score: workspace.rubricScores?.[question]?.[c.id] ?? c.score,
  }));
}
export function saveCategoryMark(
  answers: Answer[],
  workspace: Workspace,
  question: number,
  ids: string[],
  categoryId: string,
  comment: string,
): Answer[] {
  const category = categoriesFor(question, workspace).find(
    (c) => c.id === categoryId,
  );
  if (!category) throw new Error("Choose a rubric category before confirming.");
  if (
    ids.some(
      (id) => !answers.some((a) => a.id === id && a.question === question),
    )
  )
    throw new Error("A selected response no longer exists.");
  return saveMarks(answers, question, ids, category.score, comment).map((a) =>
    a.question === question && ids.includes(a.id)
      ? { ...a, categoryId: category.id, markAtSelection: category.score }
      : a,
  );
}
export function scoreChanges(
  workspace: Workspace,
  question: number,
  proposed: Record<string, number>,
) {
  const current = categoriesFor(question, workspace);
  const max = questions.find((q) => q.id === question)!.max;
  for (const c of current) {
    const value = proposed[c.id];
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > max ||
      Math.abs(value * 100 - Math.round(value * 100)) > 1e-8
    )
      throw new Error(
        `Each category score must be between 0 and ${max}, with at most two decimal places.`,
      );
  }
  if (Object.keys(proposed).some((id) => !current.some((c) => c.id === id)))
    throw new Error("Unknown rubric category.");
  return current
    .filter((c) => c.score !== proposed[c.id])
    .map((c) => ({
      categoryId: c.id,
      label: c.label,
      before: c.score,
      after: proposed[c.id],
    }));
}
export function previewCategoryScores(
  workspace: Workspace,
  answers: Answer[],
  question: number,
  proposed: Record<string, number>,
) {
  const changes = scoreChanges(workspace, question, proposed);
  const changed = new Set(changes.map((c) => c.categoryId));
  const affected = answers
    .filter(
      (a) =>
        a.question === question &&
        a.mark !== undefined &&
        a.categoryId &&
        changed.has(a.categoryId),
    )
    .map((a) => ({
      student: a.id,
      before: a.mark!,
      after: proposed[a.categoryId!],
    }));
  const next = answers.map((a) =>
    a.question === question &&
    a.mark !== undefined &&
    a.categoryId &&
    changed.has(a.categoryId)
      ? { ...a, mark: proposed[a.categoryId] }
      : a,
  );
  return {
    changes,
    affected,
    answers: next,
    legacyCount: answers.filter(
      (a) => a.question === question && a.mark !== undefined && !a.categoryId,
    ).length,
  };
}
export function applyCategoryScores(
  workspace: Workspace,
  answers: Answer[],
  question: number,
  proposed: Record<string, number>,
  reason: string,
  actorId: string,
) {
  const actor = workspace.members.find((m) => m.id === actorId);
  if (actor?.role !== "Subject coordinator")
    throw new Error("Only a subject coordinator can change category scores.");
  if (!reason.trim()) throw new Error("Enter a reason for this score change.");
  const preview = previewCategoryScores(workspace, answers, question, proposed);
  if (!preview.changes.length)
    throw new Error("Change at least one category score.");
  if (
    answers.some(
      (a) =>
        a.question === question &&
        a.locked &&
        preview.affected.some((x) => x.student === a.id),
    )
  )
    throw new Error(
      "An affected response is locked. Release the lock before applying this change.",
    );
  const record: ModerationRecord = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor: actor.name,
    question,
    reason: reason.trim(),
    changes: preview.changes,
    affected: preview.affected,
  };
  return {
    answers: preview.answers,
    workspace: {
      ...workspace,
      rubricScores: { ...workspace.rubricScores, [question]: { ...proposed } },
      moderationHistory: [...(workspace.moderationHistory ?? []), record],
    },
    record,
  };
}
export function studentTotals(answers: Answer[]) {
  const totals = new Map<
    string,
    { id: string; total: number; marked: number }
  >();
  for (const a of answers) {
    let row = totals.get(a.id);
    if (!row) {
      row = { id: a.id, total: 0, marked: 0 };
      totals.set(a.id, row);
    }
    if (a.mark !== undefined) {
      row.total = Math.round((row.total + a.mark) * 100) / 100;
      row.marked++;
    }
  }
  return [...totals.values()].sort((a, b) => a.id.localeCompare(b.id));
}
