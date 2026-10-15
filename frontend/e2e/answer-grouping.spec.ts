import { test, expect, type Page } from "@playwright/test";
import type { ExamRecord } from "../src/models/exams";

function fixture(count?: number): ExamRecord {
  const texts = count
    ? Array.from({ length: count }, (_, index) => `Answer ${index}`)
    : [
        "blue sky",
        "blue  sky ",
        "red sky",
        "blue\u00a0sky",
        "Blue sky",
        "blue sky!",
        "blue\tsky",
        "blue\nsky",
      ];
  return {
    id: "grouping",
    title: "Answer grouping demo",
    description: "Synthetic answers only",
    sampleVersion: 1,
    questionTypes: { q: "short-answer", code: "coding" },
    categories: {
      q: [
        { id: "full", score: 2, description: "Complete response" },
        { id: "zero", score: 0, description: "No credit" },
      ],
    },
    marks: count
      ? undefined
      : {
          q: {
            "Test-001": {
              score: 1,
              comment: "Individual review",
              confirmedAt: "2026-10-09T00:00:00Z",
            },
          },
        },
    answers: {
      name: "synthetic.csv",
      uploadedAt: "now",
      preview: {
        issues: [],
        questions: [
          {
            id: "q",
            text: "Describe the colour of the sky.",
            maxMark: 2,
            instruction: false,
            column: 1,
          },
          {
            id: "code",
            text: "Write a function.",
            maxMark: 2,
            instruction: false,
            column: 2,
          },
        ],
        students: texts.map((text, index) => ({
          id: `Test-${String(index + 1).padStart(3, "0")}`,
          canvasId: String(index),
          attempt: "1",
          answers: [
            {
              questionId: "q",
              original: text,
              sourceScore: "0",
              blank: false,
              unicodeReview: false,
            },
            {
              questionId: "code",
              original: "def f():\n    return 1",
              sourceScore: "0",
              blank: false,
              unicodeReview: false,
            },
          ],
        })),
      },
    },
  };
}
async function open(page: Page, exam = fixture(), waitForChart = true) {
  await page.goto("/");
  await page.evaluate((value) => {
    localStorage.setItem(
      "automarktic-exams-v1",
      JSON.stringify({ comp10001: [value] }),
    );
    sessionStorage.removeItem("automarktic-exams-v1");
  }, exam);
  await page.reload();
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await page.goto("/#/exam/grouping/question/q");
  if (waitForChart)
    await expect(
      page.getByRole("button", { name: "Group 1:", exact: false }),
    ).toBeVisible();
}
async function saved(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("automarktic-exams-v1")!)
        .comp10001[0] as ExamRecord,
  );
}

function outputFixture(): ExamRecord {
  const exam = fixture();
  exam.title = "Expression output grouping demo";
  exam.questionTypes = { ...exam.questionTypes, q: "expression-output" };
  const outputs = [
    "'a b'",
    "'a b'",
    "'ab'",
    "True",
    "true",
    "1",
    "1.0",
    "'a b'\n",
  ];
  exam.answers!.preview.questions[0].text =
    "Give the output of the expression.";
  exam.answers!.preview.students.forEach((student, index) => {
    student.answers[0].original = outputs[index];
  });
  return exam;
}

test("expression outputs group exactly, support confirmed group marks and restore saved results", async ({
  page,
}) => {
  const original = outputFixture();
  const request = page.waitForRequest("**/api/answer-groups");
  await open(page, original);
  expect((await request).postDataJSON().question_type).toBe(
    "expression-output",
  );
  await expect(page.getByText("7 groups", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Pre-processing rules", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("group-answer")).toHaveText("'a b'");
  await expect(
    page.getByText("Only identical outputs are grouped.", { exact: false }),
  ).toBeVisible();
  await page
    .locator(".answer-grouping")
    .getByRole("radio", { name: "Option 1: 2 / 2", exact: true })
    .check();
  await page
    .getByLabel("Group marker comment (optional)")
    .fill("Reviewed identical outputs");
  await page
    .locator(".answer-grouping")
    .screenshot({
      path: "grouping-test-results/expression-output-grouping.png",
    });
  await page
    .getByRole("button", { name: "Confirm group category & mark" })
    .click();
  await page
    .getByRole("button", { name: "Apply group mark", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Group mark saved for 2 students.",
  );
  const after = await saved(page);
  expect(after.marks?.q["Test-001"].score).toBe(2);
  expect(after.marks?.q["Test-002"].score).toBe(2);
  expect(after.marks?.q["Test-003"]).toBeUndefined();
  expect(after.answers).toEqual(original.answers);
  let calls = 0;
  await page.route("**/api/answer-groups", async (route) => {
    calls++;
    await route.abort();
  });
  await page.reload();
  await expect(page.getByText("7 groups", { exact: true })).toBeVisible();
  await expect(page.getByText("2 / 2 marked", { exact: true })).toBeVisible();
  expect(calls).toBe(0);
});

test("changing question type rebuilds cached groups without changing saved marks", async ({
  page,
}) => {
  await open(page, outputFixture());
  await expect(page.getByText("7 groups", { exact: true })).toBeVisible();
  const before = await saved(page);
  await page.evaluate(() => {
    const key = "automarktic-exams-v1";
    const exams = JSON.parse(localStorage.getItem(key)!);
    exams.comp10001[0].questionTypes.q = "short-answer";
    localStorage.setItem(key, JSON.stringify(exams));
    sessionStorage.setItem(key, JSON.stringify(exams));
  });
  const request = page.waitForRequest("**/api/answer-groups");
  await page.reload();
  expect((await request).postDataJSON().question_type).toBe("short-answer");
  await expect(
    page.getByRole("button", { name: "Group 1: 3 students", exact: true }),
  ).toBeVisible();
  expect((await saved(page)).marks).toEqual(before.marks);
});

test("real grouping chart, keyboard selection, group confirmation and individual override", async ({
  page,
}) => {
  const original = fixture();
  await open(page, original);
  await expect(page.getByText("7 groups", { exact: true })).toBeVisible();
  const first = page.getByRole("button", {
    name: "Group 1: 2 students",
    exact: true,
  });
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("group-answer")).toHaveText("blue sky");
  await expect(page.getByText(/2 whitespace variants/)).toBeVisible();
  await page
    .locator(".answer-grouping")
    .getByRole("radio", { name: "Option 1: 2 / 2", exact: true })
    .check();
  await page
    .getByLabel("Group marker comment (optional)")
    .fill("Reviewed both originals");
  await page
    .locator(".answer-grouping")
    .screenshot({ path: "grouping-test-results/answer-grouping.png" });
  await page
    .getByRole("button", { name: "Confirm group category & mark" })
    .click();
  await expect(
    page.getByRole("dialog").getByText(/1 existing individual marks/),
  ).toBeVisible();
  expect((await saved(page)).marks?.q["Test-002"]).toBeUndefined();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect((await saved(page)).marks?.q["Test-001"].score).toBe(1);
  await page
    .getByRole("button", { name: "Confirm group category & mark" })
    .click();
  await page
    .getByRole("button", { name: "Apply group mark", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Group mark saved for 2 students.",
  );
  const after = await saved(page);
  expect(after.marks?.q["Test-001"].score).toBe(2);
  expect(after.marks?.q["Test-002"].score).toBe(2);
  expect(after.marks?.q["Test-003"]).toBeUndefined();
  expect(after.answers).toEqual(original.answers);
  expect(after.groupMarkHistory?.[0].studentIds).toEqual([
    "Test-001",
    "Test-002",
  ]);
  await page
    .locator(".answer-grouping")
    .getByRole("button", { name: "Mark Test-002", exact: true })
    .click();
  await expect(
    page.getByText("Saved mark: 2 / 2", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "Option 2: 0 / 2", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Confirm category & mark", exact: true })
    .click();
  expect((await saved(page)).marks?.q["Test-002"].score).toBe(0);
  expect((await saved(page)).marks?.q["Test-001"].score).toBe(2);
});

test("approved Unicode rules regroup without changing any existing marks", async ({
  page,
}) => {
  await open(page);
  await page.getByText("Pre-processing rules", { exact: true }).click();
  await page.getByLabel("No-break space (U+00A0)", { exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Group 1: 2 students", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review grouping rules" }).click();
  await page.getByRole("button", { name: "Apply grouping rules" }).click();
  await expect(
    page.getByRole("button", { name: "Group 1: 3 students", exact: true }),
  ).toBeVisible();
  const next = await saved(page);
  expect(next.marks).toEqual(fixture().marks);
  expect(next.answerGrouping?.q.unicodeSpaces).toEqual(["\u00a0"]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Group 1: 3 students", exact: true }),
  ).toBeVisible();
});

test("saved groups and marks reopen in a fresh tab with the grouping API unavailable", async ({
  page,
  context,
}) => {
  await open(page);
  await page
    .locator(".answer-grouping")
    .getByRole("radio", { name: "Option 1: 2 / 2", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Confirm group category & mark" })
    .click();
  await page
    .getByRole("button", { name: "Apply group mark", exact: true })
    .click();
  await expect(page.getByText("2 / 2 marked", { exact: true })).toBeVisible();
  await page.close();
  const reopened = await context.newPage();
  let requests = 0;
  await reopened.route("**/api/answer-groups", async (route) => {
    requests++;
    await route.abort();
  });
  await reopened.goto("/");
  await reopened
    .getByRole("button", { name: "Explore demo workspace" })
    .click();
  await reopened.goto("/#/exam/grouping/question/q");
  await expect(
    reopened.getByRole("button", { name: "Group 1: 2 students", exact: true }),
  ).toBeVisible();
  await expect(
    reopened.getByText("2 / 2 marked", { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(0);
});

test("backend errors are visible and retry succeeds while individual marking remains accessible", async ({
  page,
}) => {
  await page.route("**/api/answer-groups", (route) =>
    route.fulfill({
      status: 500,
      json: {
        message:
          "Grouping could not finish. Retry or mark students individually.",
      },
    }),
  );
  await open(page, fixture(), false);
  await expect(page.getByRole("alert")).toContainText(
    "Grouping could not finish",
  );
  await expect(
    page.getByRole("button", { name: "Mark Test-001", exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/answer-groups");
  await page.getByRole("button", { name: "Retry grouping" }).click();
  await expect(
    page.getByRole("button", { name: "Group 1: 2 students", exact: true }),
  ).toBeVisible();
});

test("over 1,000 submissions have paged charts and code questions never request grouping", async ({
  page,
}) => {
  await open(page, fixture(1001));
  await expect(page.getByText("1001 groups", { exact: true })).toBeVisible();
  await expect(page.locator(".group-chart-bars button")).toHaveCount(50);
  await page.getByRole("button", { name: "Next groups" }).click();
  await expect(
    page.getByText("Groups 51–100 of 1001", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Group 51: 1 students", exact: true })
    .click();
  await expect(
    page.locator(".answer-grouping h2", { hasText: "Group 51" }),
  ).toBeVisible();
  let requests = 0;
  await page.route("**/api/answer-groups", async (route) => {
    requests++;
    await route.abort();
  });
  await page.goto("/#/exam/grouping/question/code");
  await expect(
    page.getByRole("heading", { name: "Question 2", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".answer-grouping")).toHaveCount(0);
  expect(requests).toBe(0);
});
