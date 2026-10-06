import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { ExamAttachment } from "./exams";

// Bundle the worker locally: student documents never go to an external viewer.
GlobalWorkerOptions.workerSrc = workerUrl;
export const loadPdf = (dataUrl: string) =>
  getDocument({
    data: Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0)),
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
    wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
  });
export const previewUrl = (rubric: ExamAttachment) =>
  rubric.previewPdf ?? rubric.dataUrl;

export async function prepareRubric(
  file: File,
  dataUrl: string,
  signal: AbortSignal,
) {
  let previewPdf: string | undefined;
  if (/\.docx$/i.test(file.name)) {
    let response: Response;
    try {
      response = await fetch("/api/rubric/convert", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
        body: file,
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error(
        "Cannot reach Python for Word preview. Start python3 backend/server.py, or upload a PDF.",
      );
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || typeof result?.pdf !== "string")
      throw new Error(
        result?.message ??
          "Word preview is unavailable. Start or restart python3 backend/server.py.",
      );
    previewPdf = `data:application/pdf;base64,${result.pdf}`;
  }
  const task = loadPdf(previewPdf ?? dataUrl);
  // Password prompts cannot be completed by this upload workflow.
  task.onPassword = () => {
    void task.destroy();
  };
  const abort = () => {
    void task.destroy();
  };
  signal.addEventListener("abort", abort);
  try {
    if (signal.aborted) throw new Error("Read cancelled.");
    const doc = await task.promise;
    // Parse the first page as well as the catalog before accepting the upload.
    await doc.getPage(1);
    return { previewPdf, pageCount: doc.numPages };
  } catch {
    throw new Error(
      "Cannot preview this PDF. Choose a valid, unencrypted PDF or DOCX.",
    );
  } finally {
    signal.removeEventListener("abort", abort);
    await task.destroy();
  }
}
