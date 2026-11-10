import { apiFetch } from "./auth";
// Send Word documents to the local backend for PDF conversion.
export async function convertRubric(
  file: File,
  signal: AbortSignal,
): Promise<string> {
  let response: Response;
  try {
    response = await apiFetch("/api/rubric/convert", {
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
      "Cannot reach Python for Word preview. Start npm run dev, or upload a PDF.",
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.pdf !== "string")
    throw new Error(
      result?.message ??
        "Word preview is unavailable. Start or restart npm run dev.",
    );
  return `data:application/pdf;base64,${result.pdf}`;
}
