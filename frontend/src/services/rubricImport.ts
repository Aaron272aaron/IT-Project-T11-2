import { pdfRubricParagraphs } from "../utils/pdfRubricText";
import { loadPdf } from "./rubricDocument";
export type ImportedBlock = {
  id: string;
  title: string;
  context: string;
  questionNumbers: number[];
  categories: { score: number; description: string }[];
  warnings: string[];
};
export type RubricImport = { blocks: ImportedBlock[]; warnings: string[] };

export async function importRubric(
  file: File,
  signal: AbortSignal,
): Promise<RubricImport> {
  const pdf = /\.pdf$/i.test(file.name);
  if (!pdf && !/\.docx$/i.test(file.name))
    throw new Error("Choose a DOCX or PDF document.");
  if (!file.size || file.size > (pdf ? 8 : 2) * 1024 * 1024)
    throw new Error("Choose a DOCX up to 2 MB or a PDF up to 8 MB.");
  let body: BodyInit = file;
  let contentType =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (pdf) {
    // Reuse local PDF.js. No PDF content is sent to a third-party service.
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Cannot read this PDF."));
      reader.readAsDataURL(file);
    });
    if (signal.aborted) throw new Error("Import cancelled.");
    const task = loadPdf(dataUrl);
    const cancel = () => {
      void task.destroy();
    };
    task.onPassword = cancel;
    signal.addEventListener("abort", cancel);
    try {
      const doc = await task.promise;
      if (doc.numPages > 200)
        throw new Error("Use a rubric with no more than 200 pages.");
      const lines: string[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const text = await page.getTextContent();
        lines.push(...pdfRubricParagraphs(text.items));
      }
      body = JSON.stringify({ text: lines.join("\n") });
      contentType = "application/json";
    } finally {
      signal.removeEventListener("abort", cancel);
      await task.destroy();
    }
  }
  if (signal.aborted) throw new Error("Import cancelled.");
  let response: Response;
  try {
    response = await fetch("/api/rubric/import", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
      signal,
    });
  } catch {
    throw new Error(
      "Cannot reach Python. Start python backend/server.py and retry. Manual rubric editing works without Python.",
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(result?.blocks))
    throw new Error(
      result?.message ??
        "Python did not return a rubric draft. Start or restart python backend/server.py and retry.",
    );
  return result;
}
