import Papa from "papaparse";

export const MAX_CANVAS_BYTES = 10 * 1024 * 1024;

// Keep Canvas identifiers as strings so leading zeroes are never lost.
export type CanvasQuestion = {
  id: string;
  text: string;
  maxMark: number;
  instruction: boolean;
  column: number;
};
export type CanvasAnswer = {
  questionId: string;
  original: string;
  sourceScore: string;
  blank: boolean;
  unicodeReview: boolean;
};
export type CanvasStudent = {
  id: string;
  canvasId: string;
  attempt: string;
  answers: CanvasAnswer[];
};
export type CanvasIssue = {
  severity: "error" | "warning";
  record: number;
  field: string;
  message: string;
};
export type CanvasPreview = {
  questions: CanvasQuestion[];
  students: CanvasStudent[];
  issues: CanvasIssue[];
};

// Parsing and validation now run in csv import.py through the Python API.

// A synthetic example is safe to download and is not the user's exam data.
export const canvasExampleCsv = Papa.unparse([
  [
    "id",
    "sis_id",
    "attempt",
    "100: Part 1 Instructions",
    "0.0",
    "101: Explain the output",
    "2.0",
    "102: Write a function",
    "2.0",
  ],
  [
    "11",
    "test001",
    "1",
    "",
    "0",
    "A quoted answer, with a comma.",
    "1",
    "def example():\n    return 1",
    "2",
  ],
  ["12", "test002", "1", "", "0", "", "0", "def example():\n    return 0", "0"],
]);
