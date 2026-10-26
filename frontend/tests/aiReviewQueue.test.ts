import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  AiReviewQueue,
  aiReviewKey,
  type AiReviewTask,
} from "../src/services/aiReviewQueue";
import { collectAiReviewTasks } from "../src/models/aiReviewTasks";
import type { ExamRecord } from "../src/models/exams";

import { runTests, type TestRunResult } from "../src/api/testRuns";
vi.mock("../src/api/testRuns", () => ({ runTests: vi.fn() }));
// Existing queue tests simulate a completed run with a failing original case.
beforeEach(() => {
  vi.mocked(runTests).mockReset();
  vi.mocked(runTests).mockResolvedValue({ status: "completed", passed: 0, total: 1 } as TestRunResult);
});

const task = (id: string, code = "pass"): AiReviewTask => ({
  workspaceId: "workspace",
  responseKey: `exam/${id}`,
  questionKey: "canvas:coding",
  code,
});
const valid = (code: string) => ({
  status: "already_valid",
  originalCode: code,
  suggestedCode: null,
  syntaxError: null,
  diff: [],
  message: "No syntax fix is needed.",
  modelId: null,
});
const queues: AiReviewQueue[] = [];
function queue(tasks: AiReviewTask[]) {
  const queue = new AiReviewQueue();
  queues.push(queue);
  queue.configure(tasks);
  queue.start();
  return queue;
}
afterEach(() => {
  queues.forEach((queue) => queue.stop());
  queues.length = 0;
  vi.unstubAllGlobals();
});
const eventually = (check: () => void) =>
  vi.waitFor(check, { timeout: 4000, interval: 5 });

it("processes all responses sequentially and keeps more than 100 prepared results", async () => {
  const tasks = Array.from({ length: 120 }, (_, i) => task(`${i}`));
  let inFlight = 0,
    maximum = 0;
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
    inFlight++;
    maximum = Math.max(maximum, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight--;
    return new Response(
      JSON.stringify(valid(JSON.parse(String(options.body)).code)),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const runner = queue(tasks);
  await eventually(() => expect(runner.progress().finished).toBe(120));
  expect(maximum).toBe(1);
  expect(fetcher).toHaveBeenCalledTimes(120);
  runner.configure(tasks);
  runner.prioritize(tasks[0]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(fetcher).toHaveBeenCalledTimes(120);
  expect(runner.get(aiReviewKey(tasks[0]))?.result).toEqual(valid("pass"));
  expect(runner.progress().percent).toBe(100);
});

it("updates only changed or new responses and removes stale corrections", async () => {
  const fetcher = vi.fn(
    async (_url: string, options: RequestInit) =>
      new Response(
        JSON.stringify(valid(JSON.parse(String(options.body)).code)),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const original = [task("one"), task("two")];
  const runner = queue(original);
  await eventually(() => expect(runner.progress().finished).toBe(2));
  runner.configure([original[0], task("two", "print(2)"), task("three")]);
  await eventually(() => expect(runner.progress().finished).toBe(3));
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(runner.get(aiReviewKey(original[1]))).toBeUndefined();
  expect(runner.get(aiReviewKey(original[0]))?.result).toEqual(valid("pass"));
});

it("pause stops the queue and resume ignores a late cancelled response", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (++calls === 1) await pending;
      return new Response(JSON.stringify(valid("pass")));
    }),
  );
  const tasks = [task("one"), task("two")];
  const runner = queue(tasks);
  await eventually(() => expect(calls).toBe(1));
  runner.pause();
  release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(runner.progress()).toMatchObject({ paused: true, finished: 0 });
  expect(calls).toBe(1);
  runner.resume();
  await eventually(() => expect(runner.progress().finished).toBe(2));
  expect(calls).toBe(3);
});

it("stops batch requests if the model is unavailable and resumes after setup", async () => {
  let ready = false,
    calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      calls++;
      return ready
        ? new Response(JSON.stringify(valid("pass")))
        : new Response(
            JSON.stringify({ message: "Download the model first." }),
            { status: 503 },
          );
    }),
  );
  const runner = queue([task("one"), task("two")]);
  await eventually(() =>
    expect(runner.progress().waiting).toBe("Download the model first."),
  );
  expect(calls).toBe(1);
  expect(runner.progress().finished).toBe(0);
  ready = true;
  runner.resume();
  await eventually(() => expect(runner.progress().finished).toBe(2));
  expect(calls).toBe(3);
});

it("continues after an invalid response and retries failures without rerunning successes", async () => {
  let failed = true;
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
    const { code } = JSON.parse(String(options.body));
    if (code === "invalid" && failed)
      return new Response(
        JSON.stringify({ message: "This response cannot be checked." }),
        { status: 422 },
      );
    return new Response(JSON.stringify(valid(code)));
  });
  vi.stubGlobal("fetch", fetcher);
  const runner = queue([task("one", "invalid"), task("two")]);
  await eventually(() => expect(runner.progress().finished).toBe(2));
  expect(runner.progress().needsReview).toBe(1);
  failed = false;
  runner.resume();
  await eventually(() => expect(runner.progress().needsReview).toBe(0));
  await eventually(() => expect(runner.progress().finished).toBe(2));
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("collects nonblank coding responses across workspaces and skips hidden legacy sample answers", () => {
  const exam = {
    id: "exam",
    title: "Test",
    description: "",
    questionTypes: { coding: "coding", short: "short-answer" },
    answers: {
      preview: {
        questions: [
          { id: "coding", instruction: false },
          { id: "short", instruction: false },
        ],
        students: [
          {
            id: "student",
            answers: [
              { questionId: "coding", original: "pass" },
              { questionId: "short", original: "text" },
            ],
          },
          { id: "blank", answers: [{ questionId: "coding", original: "  " }] },
        ],
      },
    },
  } as unknown as ExamRecord;
  const legacy = [
    {
      id: "legacy",
      question: 5,
      original: "pass",
      group: "A",
      test: "Not run" as const,
    },
  ];
  const tasks = collectAiReviewTasks(
    { first: [exam], second: [{ ...exam, id: "second" }] },
    { pending: legacy },
    ["first", "second", "pending"],
    "pending",
  );
  expect(tasks).toHaveLength(2);
  expect(tasks.map((item) => item.workspaceId)).toEqual(["first", "second"]);
  expect(tasks.map((item) => item.questionKey)).toEqual([
    "canvas:coding",
    "canvas:coding",
  ]);
  expect(collectAiReviewTasks({}, { legacy }, ["legacy"])).toHaveLength(1);
});

it("restores completed reviews without requests, but retries and changed code run again", async () => {
  const original = task("saved");
  const runner = new AiReviewQueue();
  queues.push(runner);
  runner.restore([{ key: aiReviewKey(original), comment: "", result: { ...valid("pass"), status: "already_valid" } }]);
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => new Response(JSON.stringify(valid(JSON.parse(String(options.body)).code))));
  vi.stubGlobal("fetch", fetcher);
  runner.configure([original]);
  runner.start();
  await eventually(() => expect(runner.progress().finished).toBe(1));
  expect(fetcher).not.toHaveBeenCalled();
  runner.regenerate(original);
  await eventually(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(fetcher.mock.calls[0][1].body)).force).toBe(true);
  await eventually(() => expect(runner.progress().finished).toBe(1));
  runner.configure([task("saved", "pass # changed")]);
  await eventually(() => expect(fetcher).toHaveBeenCalledTimes(2));
});


it("skips AI for fully passing originals and only sends failed originals for repair", async () => {
  vi.mocked(runTests).mockImplementation(async (_question, code) => ({
    status: "completed", passed: code === "good" ? 2 : 1, total: 2,
  } as TestRunResult));
  const fetcher = vi.fn(async (_url: string, options: RequestInit) =>
    new Response(JSON.stringify(valid(JSON.parse(String(options.body)).code))));
  vi.stubGlobal("fetch", fetcher);
  const passing = task("passing", "good");
  const failing = task("failing", "wrong");
  const runner = queue([passing, failing]);
  await eventually(() => expect(runner.progress().finished).toBe(2));
  expect(runner.get(aiReviewKey(passing))?.status).toBe("skipped");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(fetcher.mock.calls[0][1].body)).code).toBe("wrong");
  expect(runTests).toHaveBeenCalledWith(passing.questionKey, "good", "original", expect.any(AbortSignal));
});

it("waits for original tests before issuing an AI request", async () => {
  let release!: (result: TestRunResult) => void;
  vi.mocked(runTests).mockReturnValue(new Promise(resolve => { release = resolve; }));
  const fetcher = vi.fn(async () => new Response(JSON.stringify(valid("pass"))));
  vi.stubGlobal("fetch", fetcher);
  const runner = queue([task("waiting")]);
  await eventually(() => expect(runTests).toHaveBeenCalledTimes(1));
  expect(fetcher).not.toHaveBeenCalled();
  release({ status: "completed", passed: 0, total: 1 } as TestRunResult);
  await eventually(() => expect(runner.progress().finished).toBe(1));
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("does not generate fixes for unavailable or empty test results and continues the queue", async () => {
  vi.mocked(runTests)
    .mockRejectedValueOnce(new Error("No test suite configured"))
    .mockResolvedValueOnce({ status: "runner_error", message: "Docker unavailable" } as TestRunResult)
    .mockResolvedValueOnce({ status: "completed", total: 0, passed: 0 } as TestRunResult)
    .mockResolvedValueOnce({ status: "completed", total: 1, passed: 1 } as TestRunResult);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const runner = queue([task("missing"), task("outage"), task("empty"), task("good")]);
  await eventually(() => expect(runner.progress().finished).toBe(4));
  expect(fetcher).not.toHaveBeenCalled();
  expect(runner.progress().needsReview).toBe(3);
});

it("rechecks saved reviews and regeneration so passing code never calls AI", async () => {
  vi.mocked(runTests).mockResolvedValue({ status: "completed", passed: 1, total: 1 } as TestRunResult);
  const original = task("saved-pass");
  const runner = new AiReviewQueue(); queues.push(runner);
  runner.restore([{ key: aiReviewKey(original), comment: "", result: { ...valid("pass"), status: "already_valid" } }]);
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  runner.configure([original]); runner.start();
  await eventually(() => expect(runner.get(aiReviewKey(original))?.status).toBe("skipped"));
  expect(runner.get(aiReviewKey(original))?.result).toBeUndefined();
  runner.regenerate(original);
  await eventually(() => expect(runTests).toHaveBeenCalledTimes(2));
  await eventually(() => expect(runner.get(aiReviewKey(original))?.status).toBe("skipped"));
  expect(fetcher).not.toHaveBeenCalled();
});


it("ignores a late test result after the original answer is replaced", async () => {
  let release!: (result: TestRunResult) => void;
  vi.mocked(runTests).mockReturnValueOnce(new Promise(resolve => { release = resolve; }))
    .mockResolvedValue({ status: "completed", total: 1, passed: 1 } as TestRunResult);
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const old = task("edited", "old code");
  const updated = task("edited", "new code");
  const runner = queue([old]);
  await eventually(() => expect(runTests).toHaveBeenCalledTimes(1));
  runner.configure([updated]);
  await eventually(() => expect(runner.get(aiReviewKey(updated))?.status).toBe("skipped"));
  release({ status: "completed", total: 1, passed: 0 } as TestRunResult);
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(runner.get(aiReviewKey(old))).toBeUndefined();
  expect(fetcher).not.toHaveBeenCalled();
});
