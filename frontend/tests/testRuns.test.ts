import { afterEach, expect, test, vi } from "vitest";
import { runTests } from "../src/api/testRuns";

const code = "def similarity(board, char):\n    return 0\n";
async function result(overrides = {}) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code),
  );
  return {
    runId: "a".repeat(32),
    questionKey: "canvas:3081194",
    variant: "original",
    codeDigest: Array.from(new Uint8Array(bytes), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
    status: "completed",
    passed: 1,
    total: 1,
    cases: [
      {
        name: "absent",
        input: "similarity(...)",
        expected: "0",
        actual: "0",
        outcome: "passed",
        error: "",
        errorKind: null,
        duration: 0.1,
      },
    ],
    ...overrides,
  };
}
function respond(value: unknown, status = 202) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status })),
  );
}
afterEach(() => vi.unstubAllGlobals());
test("completed results belong to the exact submitted source", async () => {
  const value = await result();
  respond(value);
  expect(
    await runTests(
      "canvas:3081194",
      code,
      "original",
      new AbortController().signal,
    ),
  ).toEqual(value);
});
test("different code or variant cannot be displayed as this run", async () => {
  for (const overrides of [
    { codeDigest: "0".repeat(64) },
    { variant: "recommendation" },
    { questionKey: "demo:5" },
  ]) {
    respond(await result(overrides));
    await expect(
      runTests(
        "canvas:3081194",
        code,
        "original",
        new AbortController().signal,
      ),
    ).rejects.toThrow("different code");
  }
});
test("inconsistent pass counts and empty reports are rejected", async () => {
  for (const overrides of [{ passed: 0 }, { cases: [], total: 0, passed: 0 }]) {
    respond(await result(overrides));
    await expect(
      runTests(
        "canvas:3081194",
        code,
        "original",
        new AbortController().signal,
      ),
    ).rejects.toThrow("unexpected test result");
  }
});
test("runner failure remains an infrastructure error rather than zero passing tests", async () => {
  const value = await result({
    status: "runner_error",
    passed: undefined,
    total: undefined,
    cases: [],
    message: "Check Docker Desktop.",
  });
  respond(value);
  const received = await runTests(
    "canvas:3081194",
    code,
    "original",
    new AbortController().signal,
  );
  expect(received.status).toBe("runner_error");
  expect(received.passed).toBeUndefined();
});
