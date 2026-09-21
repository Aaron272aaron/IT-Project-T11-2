import Papa from "papaparse";
export type Role = "Subject coordinator" | "Tutor";
export type Member = { id: string; name: string; email: string; role: Role };
export type Workspace = {
  id: string;
  name: string;
  subject: string;
  year: string;
  period: string;
  configuration: string;
  members: Member[];
};
export type Profile = {
  name: string;
  email: string;
  username: string;
  language: string;
  timezone: string;
};
export type Answer = {
  id: string;
  question: number;
  original: string;
  group: string;
  mark?: number;
  comment?: string;
  locked?: string;
  test: "Passed" | "Failed" | "Not run";
  ai?: boolean;
};
export type Question = {
  id: number;
  title: string;
  kind: "short" | "function" | "executable";
  max: number;
  prompt: string;
  rubric: [string, number][];
};
export const questions: Question[] = [
  {
    id: 1,
    title: "Python expressions",
    kind: "short",
    max: 5,
    prompt:
      "What does len([1, 2, 3]) return in Python? Give the value and briefly explain your answer.",
    rubric: [
      ["Correct value: 3", 3],
      ["Explains that the list contains three elements", 2],
    ],
  },
  {
    id: 2,
    title: "Data types and values",
    kind: "short",
    max: 5,
    prompt: "What is the difference between a list and a tuple in Python?",
    rubric: [
      ["Identifies mutability", 3],
      ["Provides a clear explanation", 2],
    ],
  },
  {
    id: 3,
    title: "Iteration and control flow",
    kind: "executable",
    max: 10,
    prompt:
      "Write count_even(nums), which returns the number of even integers in the list nums.",
    rubric: [
      ["Correctly counts even integers", 6],
      ["Handles empty lists and negative values", 4],
    ],
  },
  {
    id: 4,
    title: "List processing",
    kind: "executable",
    max: 10,
    prompt:
      "Write positive_numbers(nums), which returns a list containing only the positive numbers from nums.",
    rubric: [
      ["Correctly filters positive values", 6],
      ["Handles empty lists and zero", 4],
    ],
  },
  {
    id: 5,
    title: "String transformation",
    kind: "function",
    max: 15,
    prompt:
      "Write a function clean_text(s) that removes leading and trailing whitespace and returns the text in lowercase.",
    rubric: [
      ["Valid Python function and syntax", 3],
      ["Removes leading and trailing whitespace", 6],
      ["Converts text to lowercase", 6],
    ],
  },
  {
    id: 6,
    title: "Dictionary aggregation",
    kind: "function",
    max: 15,
    prompt:
      "Write word_counts(words), which returns a dictionary mapping each word to its number of occurrences.",
    rubric: [
      ["Valid function and syntax", 3],
      ["Counts every occurrence correctly", 6],
      ["Handles empty input", 6],
    ],
  },
];
export const initialProfile: Profile = {
  name: "Alex Morgan",
  email: "alex.morgan@example.edu",
  username: "alex.morgan",
  language: "English",
  timezone: "Australia/Melbourne",
};
export const initialWorkspace: Workspace = {
  id: "comp10001",
  name: "COMP10001 · Semester 1, 2026",
  subject: "Foundations of Computing",
  year: "2026",
  period: "Semester 1",
  configuration: "None",
  members: [
    "Alex Morgan",
    "Jamie Lee",
    "Sam Patel",
    "Taylor Chen",
    "Jordan Kim",
    "Casey Nguyen",
  ].map((name, i) => ({
    id: i === 0 ? "me" : `member-${i}`,
    name,
    email: name.toLowerCase().replace(" ", ".") + "@example.edu",
    role: i === 0 ? "Subject coordinator" : "Tutor",
  })),
};
export const originalCode = (q: number) =>
  q === 3
    ? "def count_even(nums):\n    return sum(1 for n in nums if n % 2 == 0)"
    : q === 4
      ? "def positive_numbers(nums):\n    return [n for n in nums if n > 0]"
      : q === 5
        ? "def clean_text(s)\n    return s.strip().lower()"
        : "def word_counts(words)\n    counts = {}\n    for word in words:\n        counts[word] = counts.get(word, 0) + 1\n    return counts";
export function seedAnswers(): Answer[] {
  return questions.flatMap((q) =>
    Array.from({ length: 240 }, (_, i) => {
      const group =
        i < 72 ? "A" : i < 136 ? "B" : i < 184 ? "C" : i < 216 ? "D" : "E";
      const marked =
        (i >= 96 && q.id < 3) ||
        (q.id === 3 && i >= 48) ||
        (q.id === 4 && i >= 96) ||
        (q.id === 5 && i >= 192);
      return {
        id: `demo${String(i + 1).padStart(3, "0")}`,
        question: q.id,
        group: q.kind === "short" ? group : "—",
        original:
          q.kind === "short"
            ? q.id === 1
              ? {
                  A: "3, because the list has three elements.",
                  B: "3",
                  C: "It returns the length of the list, which is 3.",
                  D: "2",
                  E: "The expression returns a list.",
                }[group]!
              : group === "A"
                ? "Lists are mutable, while tuples are immutable."
                : group === "B"
                  ? "A tuple cannot be changed."
                  : group === "C"
                    ? "Lists and tuples store values."
                    : group === "D"
                      ? "Lists use brackets; tuples use parentheses."
                      : "They are the same."
            : q.kind === "function" && i % 4 !== 0
              ? originalCode(q.id).replace(/\)\n/, "):\n")
              : originalCode(q.id),
        mark: marked ? q.max : undefined,
        comment: marked ? "Reviewed by a human marker." : undefined,
        locked: i === 2 ? "Jamie Lee" : undefined,
        test:
          q.kind === "short"
            ? "Not run"
            : q.kind === "executable"
              ? "Passed"
              : i % 4 === 0
                ? "Failed"
                : "Passed",
        ai: q.kind === "function" && i % 10 === 0,
      };
    }),
  );
}
export type CsvIssue = { row: number; message: string };
export function validateCsv(text: string) {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) =>
      h
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase(),
  });
  const issues: CsvIssue[] = parsed.errors.map((e) => ({
    row: (e.row ?? 0) + 2,
    message: e.message,
  }));
  const required = ["student_id", "question_id", "answer"];
  for (const h of required)
    if (!parsed.meta.fields?.includes(h))
      issues.push({ row: 1, message: `Missing required column: ${h}` });
  if (parsed.data.length === 0)
    issues.push({ row: 1, message: "No answer rows found." });
  if (parsed.data.length > 10000)
    issues.push({ row: 1, message: "Maximum 10,000 rows per file." });
  const seen = new Set<string>();
  const answers: Answer[] = [];
  parsed.data.forEach((r, i) => {
    const id = r.student_id?.trim();
    const q = Number(r.question_id);
    if (!id) issues.push({ row: i + 2, message: "Student ID is required." });
    if (!questions.some((x) => x.id === q))
      issues.push({ row: i + 2, message: "Question ID must be 1–6." });
    if (r.answer === undefined || r.answer === "")
      issues.push({ row: i + 2, message: "Answer is required." });
    const key = JSON.stringify([id, q]);
    if (seen.has(key))
      issues.push({
        row: i + 2,
        message: "Duplicate student / question record.",
      });
    seen.add(key);
    if (id && questions.some((x) => x.id === q) && r.answer !== undefined)
      answers.push({
        id,
        question: q,
        original: r.answer,
        group: "—",
        test: "Not run",
      });
  });
  return { issues, answers };
}
export function saveMarks(
  answers: Answer[],
  question: number,
  ids: string[],
  mark: number,
  comment: string,
): Answer[] {
  const q = questions.find((q) => q.id === question);
  if (!q || !Number.isFinite(mark) || mark < 0 || mark > q.max)
    throw new Error(`Enter a mark between 0 and ${q?.max ?? 0}.`);
  if (!ids.length) throw new Error("No responses selected.");
  if (
    answers.some(
      (a) => a.question === question && ids.includes(a.id) && a.locked,
    )
  )
    throw new Error("A selected response is locked by another marker.");
  return answers.map((a) =>
    a.question === question && ids.includes(a.id) ? { ...a, mark, comment } : a,
  );
}
export function groupAnswers(answers: Answer[]): Answer[] {
  const maps = new Map<number, Map<string, string>>();
  return answers.map((a) => {
    if (questions.find((q) => q.id === a.question)?.kind !== "short") return a;
    let groups = maps.get(a.question);
    if (!groups) {
      groups = new Map();
      maps.set(a.question, groups);
    }
    if (!groups.has(a.original)) groups.set(a.original, `G${groups.size + 1}`);
    return { ...a, group: groups.get(a.original)! };
  });
}
export function download(
  name: string,
  contents: string,
  type = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const sampleCsv =
  'student_id,question_id,answer\ndemo241,1,"3, because the list has three elements."\ndemo241,5,"def clean_text(s):\n    return s.strip().lower()"\ndemo242,3,"def count_even(nums):\n    return sum(1 for n in nums if n % 2 == 0)"\n';
