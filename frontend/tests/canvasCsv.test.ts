import { afterEach, describe, expect, it, vi } from "vitest";
import { previewCanvasCsv } from "../src/services/api";

// These tests cover the network contract; CSV rules are tested against Python.
const preview = {
  questions: [
    { id: "1", text: "Question", maxMark: 2, instruction: false, column: 3 },
  ],
  students: [
    {
      id: "001",
      canvasId: "11",
      attempt: "1",
      answers: [
        {
          questionId: "1",
          original: "  code\r\n",
          sourceScore: "1",
          blank: false,
          unicodeReview: false,
        },
      ],
    },
  ],
  issues: [],
};
const envelope = {
  status: "ok",
  service: "automarktic-python",
  parser: "csv import.py",
  preview,
};
const file = new File(["original bytes"], "example.csv");
const signal = () => new AbortController().signal;
function reply(data: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status })),
  );
}
afterEach(() => vi.unstubAllGlobals());

describe("Python Canvas API", () => {
  it("posts the original File and renders the validated response", async () => {
    reply(envelope);
    expect(await previewCanvasCsv(file, signal())).toEqual(preview);
    expect(fetch).toHaveBeenCalledWith(
      "/api/canvas/preview",
      expect.objectContaining({
        method: "POST",
        body: file,
        headers: { "Content-Type": "text/csv" },
      }),
    );
  });
  it("returns validation issues on 422", async () => {
    const invalid = {
      questions: [],
      students: [],
      issues: [
        {
          severity: "error",
          record: 1,
          field: "header",
          message: "Missing ID",
        },
      ],
    };
    reply({ ...envelope, status: "invalid", preview: invalid }, 422);
    expect(await previewCanvasCsv(file, signal())).toEqual(invalid);
  });
  it("rejects malformed and inconsistent successful responses", async () => {
    for (const data of [
      {},
      { ...envelope, parser: "wrong" },
      { ...envelope, preview: { ...preview, students: [{}] } },
      { ...envelope, preview: { ...preview, students: [] } },
      {
        ...envelope,
        preview: {
          ...preview,
          issues: [
            { severity: "error", record: 1, field: "x", message: "bad" },
          ],
        },
      },
    ]) {
      reply(data);
      await expect(previewCanvasCsv(file, signal())).rejects.toThrow(
        /unexpected|inconsistent/,
      );
    }
  });
  it("explains HTTP, proxy and network failures", async () => {
    reply({ message: "Choose a CSV no larger than 10 MB." }, 413);
    await expect(previewCanvasCsv(file, signal())).rejects.toThrow("10 MB");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 })),
    );
    await expect(previewCanvasCsv(file, signal())).rejects.toThrow(
      "Start or restart",
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(previewCanvasCsv(file, signal())).rejects.toThrow(
      "Cannot reach Python",
    );
  });
  it("propagates cancellation so the page can distinguish timeout from failure", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(aborted));
    await expect(previewCanvasCsv(file, controller.signal)).rejects.toBe(
      aborted,
    );
  });
});
