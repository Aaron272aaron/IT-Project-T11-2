import type { ExamRecord } from "./exams";
import { questions } from "./domain";
export type PageRange = { start: number; end: number };
export function validRange(range: PageRange, count: number) {
  return (
    Number.isInteger(range.start) &&
    Number.isInteger(range.end) &&
    range.start >= 1 &&
    range.end >= range.start &&
    range.end <= count
  );
}
export function rubricQuestions(exam: ExamRecord) {
  // Demo question IDs and real Canvas IDs belong to different namespaces.
  return [
    ...(exam.id === "final" && !exam.sampleVersion
      ? questions.map((q) => ({
          key: `demo:${q.id}`,
          label: `Demo question ${q.id} · ${q.title}`,
        }))
      : []),
    ...(exam.answers?.preview.questions
      .filter((q) => !q.instruction)
      .map((q, i) => ({
        key: `canvas:${q.id}`,
        label: `CSV question ${i + 1} · ${q.text} (ID ${q.id})`,
      })) ?? []),
  ];
}

// Validate the entire operation before returning a draft; never truncate at the last page.
export function assignSequentialPages(
  keys: string[],
  first: number,
  last: number,
  start: number,
  pagesEach: number,
  pageCount: number,
) {
  if (
    ![first, last, start, pagesEach].every(Number.isInteger) ||
    first < 1 ||
    last < first ||
    last > keys.length ||
    start < 1 ||
    pagesEach < 1
  )
    throw new Error(
      "Choose a valid question range, starting page and pages per question.",
    );
  const end = start + (last - first + 1) * pagesEach - 1;
  if (end > pageCount)
    throw new Error(
      `This sequence needs page ${end}, but the rubric has ${pageCount} pages. Select fewer questions or another starting page.`,
    );
  return Object.fromEntries(
    keys
      .slice(first - 1, last)
      .map((key, i) => [
        key,
        { start: start + i * pagesEach, end: start + (i + 1) * pagesEach - 1 },
      ]),
  );
}
