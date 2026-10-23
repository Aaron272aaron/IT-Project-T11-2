import { apiFetch, isDemoSession } from "./auth";
import { isDatabaseReviewKey } from "../demo/examStorage";
export type FixRecommendation = {
  status: "already_valid" | "repaired" | "invalid_generation";
  originalCode: string;
  suggestedCode: string | null;
  syntaxError: { message: string; line: number | null } | null;
  diff: string[];
  message: string;
  modelId: string | null;
};

export class AiReviewError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function recommendFix(
  code: string,
  signal: AbortSignal,
  comment = "",
  review?: { reviewKey: string; force: boolean },
): Promise<FixRecommendation> {
  let response: Response;
  try {
    response = await apiFetch("/api/ai/suggest-fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        ...review,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      }),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "Cannot reach AI review. Start the app with npm run dev, or continue marking manually.",
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new AiReviewError(
      typeof result?.message === "string"
        ? result.message
        : "AI review is unavailable. Continue marking manually.",
      response.status,
    );
  if (
    !result ||
    !["already_valid", "repaired", "invalid_generation"].includes(
      result.status,
    ) ||
    result.originalCode !== code ||
    typeof result.message !== "string" ||
    !Array.isArray(result.diff) ||
    !result.diff.every((line: unknown) => typeof line === "string") ||
    (result.modelId !== null && typeof result.modelId !== "string") ||
    (result.syntaxError !== null &&
      (!result.syntaxError ||
        typeof result.syntaxError.message !== "string" ||
        (result.syntaxError.line !== null &&
          (!Number.isInteger(result.syntaxError.line) ||
            result.syntaxError.line < 1)))) ||
    (result.status === "repaired"
      ? typeof result.suggestedCode !== "string" ||
        !result.suggestedCode.trim() ||
        result.suggestedCode === code
      : result.suggestedCode !== null)
  ) {
    throw new Error(
      "AI returned an unexpected response. Continue marking manually.",
    );
  }
  return result;
}

export type SavedAiReview = { key: string; comment: string; result: FixRecommendation };
export async function loadAiReviews(): Promise<SavedAiReview[]> {
  const response = await apiFetch("/api/ai/reviews");
  const data = await response.json();
  if (!response.ok || !Array.isArray(data.reviews))
    throw new Error(data.message || "Could not load saved AI reviews.");
  return isDemoSession() ? data.reviews.filter((review: SavedAiReview) => isDatabaseReviewKey(review.key)) : data.reviews;
}
