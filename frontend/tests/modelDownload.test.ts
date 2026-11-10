import { afterEach, expect, it, vi } from "vitest";
import { modelDownloadRequest, downloadSize } from "../src/api/modelDownload";
import { setApiSession } from "../src/api/auth";
const progress = {
  status: "downloading",
  downloadedBytes: 1500,
  totalBytes: 3000,
  percent: 50,
  filename: "model.safetensors",
  message: "Downloading…",
  installed: false,
  modelId: "local-model",
};
afterEach(() => {
  vi.unstubAllGlobals();
  setApiSession(null);
});
function reply(value: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(value), { status })),
      ),
  );
}
it("reads byte progress and sends only an empty model setup request", async () => {
  reply(progress);
  expect(await modelDownloadRequest("status")).toEqual(progress);
  await modelDownloadRequest("download");
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/ai/model/download",
    expect.objectContaining({
      method: "POST",
      body: "{}",
      credentials: "same-origin",
    }),
  );
});
it("rejects impossible percentages and byte totals", async () => {
  for (const value of [
    { ...progress, percent: 101 },
    { ...progress, downloadedBytes: 3001 },
    { ...progress, totalBytes: -1 },
    { ...progress, installed: "yes" },
  ]) {
    reply(value);
    await expect(modelDownloadRequest("status")).rejects.toThrow("unexpected");
  }
});
it("keeps the backend's useful error message", async () => {
  reply({ message: "Coordinator access is required." }, 403);
  await expect(modelDownloadRequest("download")).rejects.toThrow("Coordinator");
});
it("formats real downloaded byte counts", () => {
  expect(downloadSize(1_500_000_000)).toBe("1.50 GB");
  expect(downloadSize(20_000_000)).toBe("20.0 MB");
});
