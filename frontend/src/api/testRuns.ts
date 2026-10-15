import { apiFetch } from "./auth";
export type TestCaseResult = {
  name: string;
  input: string;
  expected: string;
  actual: string;
  outcome: "passed" | "failed";
  errorKind: string | null;
  error: string;
  duration: number;
};
export type TestRunResult = {
  runId: string;
  questionKey: string;
  variant: "original" | "recommendation";
  codeDigest: string;
  status: "queued" | "running" | "completed" | "runner_error";
  passed?: number;
  total?: number;
  cases?: TestCaseResult[];
  message?: string;
};

async function responseJson(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "The test runner is unavailable. Start the app with npm run dev and check Docker Desktop.",
    );
  return data;
}

function validate(
  value: TestRunResult,
  questionKey: string,
  variant: string,
  digest: string,
  runId?: string,
) {
  if (
    !value ||
    typeof value.runId !== "string" ||
    !/^[a-f0-9]{32}$/.test(value.runId) ||
    (runId && value.runId !== runId) ||
    value.questionKey !== questionKey ||
    value.variant !== variant ||
    value.codeDigest !== digest ||
    !["queued", "running", "completed", "runner_error"].includes(value.status)
  )
    throw new Error(
      "The runner returned a result for different code. Run the tests again.",
    );
  if (
    value.status === "completed" &&
    (!Array.isArray(value.cases) ||
      !Number.isInteger(value.passed) ||
      !Number.isInteger(value.total) ||
      value.total! <= 0 ||
      value.total !== value.cases.length ||
      value.passed! < 0 ||
      value.passed! > value.total! ||
      value.passed !==
        value.cases.filter((c) => c?.outcome === "passed").length ||
      !value.cases.every(
        (c) =>
          c &&
          typeof c.name === "string" &&
          typeof c.input === "string" &&
          typeof c.expected === "string" &&
          typeof c.actual === "string" &&
          typeof c.error === "string" &&
          ["passed", "failed"].includes(c.outcome) &&
          Number.isFinite(c.duration),
      ))
  )
    throw new Error("The runner returned an unexpected test result.");
  return value;
}

function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const cancel = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, 500);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

export async function runTests(
  questionKey: string,
  code: string,
  variant: "original" | "recommendation",
  signal: AbortSignal,
): Promise<TestRunResult> {
  const digestBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code),
  );
  const digest = Array.from(new Uint8Array(digestBytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  try {
    let job = validate(
      await responseJson(
        await apiFetch("/api/test-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionKey, code, variant }),
          signal,
          cache: "no-store",
        }),
      ),
      questionKey,
      variant,
      digest,
    );
    const runId = job.runId;
    const deadline = Date.now() + 180_000;
    while (job.status === "queued" || job.status === "running") {
      if (Date.now() > deadline)
        throw new Error(
          "The test run took too long. You can retry or continue marking manually.",
        );
      await pause(signal);
      job = validate(
        await responseJson(
          await apiFetch(`/api/test-runs/${runId}`, {
            signal,
            cache: "no-store",
          }),
        ),
        questionKey,
        variant,
        digest,
        runId,
      );
    }
    return job;
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof TypeError)
      throw new Error(
        "Cannot reach the test runner. Start the app with npm run dev and check Docker Desktop.",
      );
    throw error;
  }
}
