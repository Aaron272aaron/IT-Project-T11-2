import { afterEach, expect, it, vi } from "vitest";
import { recommendFix } from "../src/api/ai";

const code = "def greet()\n    return 'hi'\n";
const result = {
  status: "repaired",
  originalCode: code,
  suggestedCode: code.replace("greet()", "greet():"),
  syntaxError: { message: "expected ':'", line: 1 },
  diff: ["-def greet()", "+def greet():"],
  message: "Suggested syntax fix.",
  modelId: "local-test-model",
};
const signal = () => new AbortController().signal;
function reply(payload: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(payload), { status })),
  );
}
afterEach(() => vi.unstubAllGlobals());

it("sends original code and returns a checked recommendation", async () => {
  reply(result);
  expect(await recommendFix(code, signal())).toEqual(result);
  expect(fetch).toHaveBeenCalledWith(
    "/api/ai/suggest-fix",
    expect.objectContaining({
      body: JSON.stringify({ code }),
      cache: "no-store",
    }),
  );
});
it("rejects stale, incomplete, or unchanged repair results", async () => {
  for (const payload of [
    null,
    {},
    { ...result, originalCode: "other response" },
    { ...result, suggestedCode: code },
    { ...result, diff: [3] },
    { ...result, syntaxError: {} },
  ]) {
    reply(payload);
    await expect(recommendFix(code, signal())).rejects.toThrow("unexpected");
  }
});
it("sends marker guidance with regeneration and omits blank comments", async () => {
  reply(result);
  await recommendFix(code, signal(), "  Add the missing colon on line 1.  ");
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/ai/suggest-fix",
    expect.objectContaining({
      body: JSON.stringify({
        code,
        comment: "Add the missing colon on line 1.",
      }),
    }),
  );
  reply(result);
  await recommendFix(code, signal(), "   ");
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/ai/suggest-fix",
    expect.objectContaining({ body: JSON.stringify({ code }) }),
  );
});
it("surfaces unavailable and busy model replies", async () => {
  for (const status of [429, 503]) {
    reply({ message: "Continue manually" }, status);
    await expect(recommendFix(code, signal())).rejects.toThrow(
      "Continue manually",
    );
  }
});
it("preserves cancellation and handles a stopped backend", async () => {
  const controller = new AbortController();
  controller.abort();
  const error = new DOMException("Aborted", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
  await expect(recommendFix(code, controller.signal)).rejects.toBe(error);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(recommendFix(code, signal())).rejects.toThrow(
    "continue marking manually",
  );
});
