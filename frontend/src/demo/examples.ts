import Papa from "papaparse";
import type { ExamRecord } from "../models/exams";

// Return a fresh copy so a new demo exam never changes the bundled sample.
export async function loadExampleData(): Promise<ExamRecord> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}demo/sample-exam.json`,
  );
  if (!response.ok)
    throw new Error("Could not load example data. Please retry.");
  const exam: ExamRecord = await response.json();
  if (!exam.answers?.preview || !exam.rubric)
    throw new Error("Example files are unavailable.");
  return exam;
}

// Reconstruct the bundled Canvas layout, preserving each original answer.
export async function loadExampleCsv(): Promise<File> {
  const exam = await loadExampleData();
  const { questions, students } = exam.answers!.preview;
  const header: string[] = ["id", "sis_id", "attempt"];
  for (const question of questions) {
    header[question.column] = `${question.id}: ${question.text}`;
    header[question.column + 1] = String(question.maxMark);
  }
  const rows = students.map((student) => {
    const row: string[] = [student.canvasId, student.id, student.attempt];
    for (const question of questions) {
      const answer = student.answers.find(
        (item) => item.questionId === question.id,
      );
      row[question.column] = answer?.original ?? "";
      row[question.column + 1] = answer?.sourceScore ?? "";
    }
    return row;
  });
  return new File([Papa.unparse([header, ...rows])], "example-answers.csv", {
    type: "text/csv",
  });
}
