import { apiFetch } from "./auth";

export type ModelDownloadStatus = {
  status:
    | "missing"
    | "checking"
    | "downloading"
    | "verifying"
    | "loading"
    | "ready"
    | "error"
    | "cancelled"
    | "disabled";
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  filename: string;
  message: string;
  installed: boolean;
  modelId: string;
};
export const modelDownloadActive = (status: ModelDownloadStatus["status"]) =>
  ["checking", "downloading", "verifying", "loading"].includes(status);

export async function modelDownloadRequest(
  action: "status" | "download" | "cancel",
  signal?: AbortSignal,
): Promise<ModelDownloadStatus> {
  const response = await apiFetch(
    `/api/ai/model${action === "status" ? "" : `/${action}`}`,
    action === "status"
      ? { signal }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal,
        },
  );
  const value = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(value?.message ?? "Local AI setup is unavailable. Retry.");
  if (
    !value ||
    ![
      "missing",
      "checking",
      "downloading",
      "verifying",
      "loading",
      "ready",
      "error",
      "cancelled",
      "disabled",
    ].includes(value.status) ||
    typeof value.message !== "string" ||
    typeof value.filename !== "string" ||
    typeof value.installed !== "boolean" ||
    typeof value.modelId !== "string" ||
    ![value.downloadedBytes, value.totalBytes, value.percent].every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0,
    ) ||
    value.percent > 100 ||
    value.downloadedBytes > value.totalBytes
  ) {
    throw new Error("Local AI setup returned an unexpected progress response.");
  }
  return value;
}

export function downloadSize(bytes: number) {
  return bytes >= 1_000_000_000
    ? `${(bytes / 1_000_000_000).toFixed(2)} GB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;
}
