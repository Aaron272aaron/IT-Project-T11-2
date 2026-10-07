import type { RubricCategory } from "./exams";

export function matchesCategory(option: RubricCategory, id?: string): boolean {
  return !!id && (option.id === id || !!option.mergedIds?.includes(id));
}

// One visible option per score. Keep every description and old option identity.
// Blank numeric drafts stay independent until the coordinator enters a valid score.
export function groupCategories(options: RubricCategory[]): RubricCategory[] {
  const grouped: RubricCategory[] = [];
  for (const option of options) {
    const group = Number.isFinite(option.score)
      ? grouped.find((c) => c.score === option.score)
      : undefined;
    if (!group) {
      grouped.push({ ...option, mergedIds: [...(option.mergedIds ?? [])] });
      continue;
    }
    if (
      option.description.trim() &&
      group.description.trim() !== option.description.trim()
    )
      group.description = [group.description.trim(), option.description.trim()]
        .filter(Boolean)
        .join("\n\n");
    group.mergedIds = [
      ...new Set([
        ...(group.mergedIds ?? []),
        option.id,
        ...(option.mergedIds ?? []),
      ]),
    ].filter((id) => id !== group.id);
  }
  return grouped;
}
export function groupCategoryMap(
  categories: Record<string, RubricCategory[]> = {},
) {
  return Object.fromEntries(
    Object.entries(categories).map(([id, options]) => [
      id,
      groupCategories(options),
    ]),
  );
}
