import { afterEach, expect, it, vi } from "vitest";
import {
  AiReviewQueue,
  aiReviewKey,
  type AiReviewTask,
} from "../src/services/aiReviewQueue";
import { collectAiReviewTasks } from "../src/models/aiReviewTasks";
import type { ExamRecord } from "../src/models/exams";

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
