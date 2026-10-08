// The wire response must be checked at runtime before rendering server data.
import type { CanvasPreview } from "../models/canvasCsv";
function isCanvasPreview(value: unknown): value is CanvasPreview {
  if (!value || typeof value !== "object") return false;
  const p = value as CanvasPreview;
  return (
    Array.isArray(p.questions) &&
    p.questions.every(
      (q) =>
        q &&
        typeof q.id === "string" &&
        typeof q.text === "string" &&
        Number.isFinite(q.maxMark) &&
        q.maxMark >= 0 &&
        typeof q.instruction === "boolean" &&
        Number.isInteger(q.column) &&
        q.column >= 0,
    ) &&
    Array.isArray(p.students) &&
    p.students.every(
      (s) =>
        s &&
        typeof s.id === "string" &&
        typeof s.canvasId === "string" &&
        typeof s.attempt === "string" &&
        Array.isArray(s.answers) &&
        s.answers.every(
          (a) =>
            a &&
            typeof a.questionId === "string" &&
            typeof a.original === "string" &&
            typeof a.sourceScore === "string" &&
            typeof a.blank === "boolean" &&
            typeof a.unicodeReview === "boolean",
        ),
    ) &&
    Array.isArray(p.issues) &&
    p.issues.every(
      (i) =>
        i &&
        (i.severity === "error" || i.severity === "warning") &&
        Number.isInteger(i.record) &&
        i.record >= 0 &&
        typeof i.field === "string" &&
        typeof i.message === "string",
    )
  );
}

// Send the original File bytes rather than decoding and rewriting code in JS.
// Vite forwards this request to the local Python server.
export async function previewCanvasCsv(
  file: File,
  signal: AbortSignal,
): Promise<CanvasPreview> {
  let response: Response;
  try {
    response = await fetch("/api/canvas/preview", {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: file,
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "Cannot reach Python. Start python3 backend/server.py and try again.",
    );
  }
  // A stopped backend can make Vite return a non-JSON proxy error.
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Python did not return a CSV result (HTTP ${response.status}). Start or restart python3 backend/server.py.`,
    );
  }
  if (response.status !== 200 && response.status !== 422) {
    const message =
      data && typeof data.message === "string"
        ? data.message
        : "Start or restart python3 backend/server.py.";
    throw new Error(
      `Python request failed (HTTP ${response.status}). ${message}`,
    );
  }
  // 422 is a completed validation with CSV errors, not a connection failure.
  if (
    !data ||
    data.service !== "automarktic-python" ||
    data.parser !== "csv import.py" ||
    data.status !== (response.status === 200 ? "ok" : "invalid") ||
    !isCanvasPreview(data.preview)
  ) {
    throw new Error(
      "Python returned an unexpected CSV response. Restart the backend and try again.",
    );
  }
  const preview: CanvasPreview = data.preview;
  const invalid = preview.issues.some((i) => i.severity === "error");
  if (
    invalid !== (response.status === 422) ||
    (!invalid && (!preview.students.length || !preview.questions.length))
  ) {
    throw new Error(
      "Python returned an inconsistent CSV result. Please retry.",
    );
  }
  return preview;
}
