import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { ExamRecord, ExamRegistry } from "../src/models/exams";
import {
  questionType,
  supportsAnswerGrouping,
} from "../src/models/questionTypes";

function fixture(count: number): ExamRecord {
  const sample: ExamRecord = JSON.parse(
    readFileSync("public/demo/sample-exam.json", "utf8"),
  );
  const source = sample.answers!.preview.students[0];
  const questions = sample.answers!.preview.questions.filter(
    (q) => !q.instruction,
  );
  return {
    ...sample,
    id: "locked-preview",
    title: "Final 2025",
    sampleVersion: undefined,
    marks: {},
    submissionLocks: Object.fromEntries(
      questions
        .filter((q) => !supportsAnswerGrouping(questionType(sample, q.id)))
        .map((q, index) => [
          q.id,
          {
            TEST000001: ["Alex Chen", "Sam Taylor", "Priya Shah"][index % 3],
          },
        ]),
    ),
    questionLocks: { [questions[0].id]: "Alex Chen" },
    answers: {
      ...sample.answers!,
      preview: {
        ...sample.answers!.preview,
        students: Array.from({ length: count }, (_, index) => ({
          ...source,
          id: `TEST${String(index + 1).padStart(6, "0")}`,
          canvasId: String(index + 1),
        })),
      },
    },
  };
}

async function open(page: Page, exam: ExamRecord) {
  let registry: ExamRegistry = { comp10001: [exam] };
  let revision = 1;
  await page.route("**/api/exams", async (route) => {
    if (route.request().method() === "POST") {
      const update = route.request().postDataJSON();
      expect(update.revision).toBe(revision);
      registry = update.registry;
      await route.fulfill({ json: { revision: ++revision } });
    } else await route.fulfill({ json: { revision, registry } });
  });
  await page.route("**/api/ai/suggest-fix", (route) =>
    route.fulfill({
      status: 503,
      json: { message: "AI unavailable during UI checks." },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Subject dashboard", exact: true }),
  ).toBeVisible();
  return () => registry.comp10001[0];
}

test("each question shows the correct lock scope immediately and next skips locked submissions", async ({
  page,
}) => {
  test.setTimeout(90000);
  const exam = fixture(2000);
  const saved = await open(page, exam);
  // This check covers the response list and immediate banner without waiting for grouping.
  await page.route("**/api/answer-groups", (route) => route.abort());
  for (const question of exam.answers!.preview.questions.filter(
    (q) => !q.instruction,
  )) {
    await page.goto(`/#/exam/${exam.id}/question/${question.id}`);
    const grouped = supportsAnswerGrouping(questionType(exam, question.id));
    const questionLocked = !!exam.questionLocks?.[question.id];
    const activity = page.locator(".notice.warning").filter({
      hasText: grouped ? "is marking this question" : "Submissions in progress",
    });
    if (!grouped || questionLocked) {
      await expect(
        activity.getByText(grouped ? "🔒 Question locked" : "🔒 Locked", {
          exact: true,
        }),
      ).toBeVisible();
      if (!grouped) await expect(activity).toContainText("TEST000001");
      const box = await activity.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThan(960);
      await expect(activity).not.toContainText(/demo/i);
    } else {
      await expect(activity).toHaveCount(0);
      await expect(
        page.getByText("🔒 Question locked", { exact: true }),
      ).toHaveCount(0);
    }
    const responses = page.locator("section.card").filter({
      has: page.getByRole("heading", {
        name: "Student responses",
        exact: true,
      }),
    });
    await expect(
      responses
        .locator("tbody tr")
        .first()
        .getByRole("button", {
          name: questionLocked
            ? "View TEST000001"
            : grouped
              ? "Mark TEST000001"
              : "Locked TEST000001",
          exact: true,
        }),
    )[grouped ? "toBeEnabled" : "toBeDisabled"]();
    await expect(
      responses.getByRole("button", {
        name: questionLocked ? "View TEST000002" : "Mark TEST000002",
        exact: true,
      }),
    ).toBeEnabled();
  }
  await page.goto(`/#/exam/${exam.id}/question/3081194`);
  await page
    .locator(".notice.warning")
    .filter({ hasText: "Submissions in progress" })
    .screenshot({ path: "test-results/project2-submission-locks.png" });
  await page
    .getByRole("button", { name: "View TEST000001", exact: true })
    .click();
  await expect(
    page.getByText(/Alex Chen|Sam Taylor|Priya Shah/).last(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Confirm and next response",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.goto(`/#/exam/${exam.id}/question/3081194/mark/TEST002000`);
  await page
    .getByRole("radio", { name: "Option 2: 5 / 6", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Confirm and next response", exact: true })
    .click();
  await expect(page).toHaveURL(/\/mark\/TEST000002$/);
  expect(saved().marks?.["3081194"].TEST002000.score).toBe(5);
  await page.reload();
  await expect(page.getByTestId("sample-answer")).toBeVisible();
  await page.goto(`/#/exam/${exam.id}/question/3081194`);
  await expect(
    page.getByRole("button", { name: "Locked TEST000001", exact: true }),
  ).toBeDisabled();
});

test("short answers have no grouping and keep individual submission locks", async ({
  page,
}) => {
  const exam = fixture(4);
  const saved = await open(page, exam);
  let groupingRequests = 0;
  await page.route("**/api/answer-groups", (route) => {
    groupingRequests++;
    return route.abort();
  });
  await page.goto(`/#/exam/${exam.id}/question/3081198`);
  await expect(page.locator(".answer-grouping")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Locked TEST000001", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Mark TEST000002", exact: true })
    .click();
  await page
    .getByRole("radio", { name: "Option 1: 4 / 4", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Confirm and next response", exact: true })
    .click();
  await expect(page).toHaveURL(/\/mark\/TEST000003$/);
  expect(saved().marks?.["3081198"].TEST000001).toBeUndefined();
  expect(Object.keys(saved().marks!["3081198"])).toEqual(["TEST000002"]);
  expect(groupingRequests).toBe(0);
});

test("a grouped question is locked for every student and group marking is disabled", async ({
  page,
}) => {
  const exam = fixture(4);
  exam.autoMarkedQuestionIds = [];
  const saved = await open(page, exam);
  await page.goto(`/#/exam/${exam.id}/question/3081158`);
  await expect(
    page.getByText("🔒 Question locked", { exact: true }),
  ).toBeVisible();
  const groups = page.locator(".answer-grouping");
  await expect(
    groups.getByRole("button", {
      name: "Confirm group category & mark",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(groups.getByRole("radio").first()).toBeDisabled();
  await expect(
    page.getByRole("columnheader", { name: "Submission access", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".notice.warning")
    .filter({ hasText: "is marking this question" })
    .screenshot({ path: "test-results/project2-question-lock.png" });
  await page.goto(`/#/exam/${exam.id}/question/3081158/mark/TEST000002`);
  await expect(page.getByTestId("sample-answer")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Confirm and next response",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(saved().marks).toEqual({});
});

test("Q2 is unlocked and its whole answer group can be marked while Q1 stays locked", async ({
  page,
}) => {
  const exam = fixture(4);
  exam.autoMarkedQuestionIds = [];
  const saved = await open(page, exam);
  await page.goto(`/#/exam/${exam.id}/question/3081159`);
  const groups = page.locator(".answer-grouping");
  await expect(groups.getByRole("radio").first()).toBeEnabled();
  await expect(
    page.getByText("🔒 Question locked", { exact: true }),
  ).toHaveCount(0);
  await groups.getByRole("radio").first().check();
  await groups
    .getByRole("button", { name: "Confirm group category & mark", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Apply group mark", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(Object.keys(saved().marks!["3081159"])).toHaveLength(4);
  expect(saved().questionLocks).toEqual({ "3081158": "Alex Chen" });
});
