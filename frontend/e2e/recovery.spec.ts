import { test, expect } from "@playwright/test";

test("real short-answer groups, append-only history and restored Docker results", async ({
  page,
  context,
}) => {
  const headers = { "X-App-Request": "AutoMarktic" };
  const registered = await context.request.post("/api/auth/register", {
    headers,
    data: {
      name: "Recovery Coordinator",
      username: "recovery",
      email: "recovery@example.edu",
      password: "Synthetic password 123!",
    },
  });
  expect(registered.status()).toBe(201);
  const session = await registered.json();
  const secure = { ...headers, "X-CSRF-Token": session.csrfToken };
  const code =
    "def similarity(board, char):\n    return sum(row.count(char) for row in board)";
  const exam = {
    id: "recovery",
    title: "Recovery exam",
    description: "",
    questionTypes: { q: "short-answer", "3081194": "coding" },
    categories: {
      q: [
        { id: "full", score: 2, description: "Correct short answer" },
        { id: "partial", score: 1, description: "Partial answer" },
      ],
    },
    answers: {
      name: "synthetic.csv",
      uploadedAt: "now",
      preview: {
        issues: [],
        questions: [
          {
            id: "q",
            text: "Explain",
            maxMark: 2,
            column: 0,
            instruction: false,
          },
          {
            id: "3081194",
            text: "Count matching letters",
            maxMark: 6,
            column: 1,
            instruction: false,
          },
        ],
        students: ["s1", "s2"].map((id, index) => ({
          id,
          canvasId: id,
          attempt: "1",
          answers: [
            {
              questionId: "q",
              original: index ? "helloworld" : "hello world",
              sourceScore: "0",
              blank: false,
              unicodeReview: false,
            },
            {
              questionId: "3081194",
              original: code,
              sourceScore: "0",
              blank: false,
              unicodeReview: false,
            },
          ],
        })),
      },
    },
  };
  expect(
    (
      await context.request.post("/api/exams", {
        headers: secure,
        data: { revision: 0, registry: { comp10001: [exam] } },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/");
  await page.getByLabel("Email or Username").fill("recovery");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic password 123!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Subject dashboard", exact: true }),
  ).toBeVisible();
  await page.goto("/#/exam/recovery/question/q");
  await expect(
    page.getByRole("button", { name: "Group 1: 2 students", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio").first().check();
  await page
    .getByRole("button", { name: "Confirm group category & mark", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Apply group mark", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/#/exam/recovery/question/q/mark/s1");
  await page.getByText("Marking history", { exact: true }).click();
  await expect(page.locator(".mark-history li")).toHaveCount(1);
  await expect(page.locator(".mark-history")).toContainText(
    "Recovery Coordinator",
  );
  await expect(page.locator(".mark-history")).toContainText("Unmarked → 2");
  await page.getByRole("radio").nth(1).check();
  await page
    .getByLabel("Reason for mark change (optional)", { exact: true })
    .fill("Reviewed explanation");
  await page
    .getByRole("button", { name: "Confirm category & mark", exact: true })
    .click();
  await expect(page.locator(".mark-history li")).toHaveCount(2);
  await expect(page.locator(".mark-history")).toContainText(
    "Reviewed explanation",
  );
  await page.reload();
  await page.getByText("Marking history", { exact: true }).click();
  await expect(page.locator(".mark-history li")).toHaveCount(2);
  await page.goto("/#/exam/recovery/question/3081194/mark/s1");
  const tests = page.getByRole("region", {
    name: "Original code test results",
    exact: true,
  });
  await tests
    .getByRole("button", { name: "Run original tests", exact: true })
    .click();
  await expect(tests).toContainText("Original code: 6 / 6 tests passed", {
    timeout: 60000,
  });
  let reruns = 0;
  await page.route("**/api/test-runs", async (route) => {
    if (route.request().method() === "POST") {
      reruns++;
      await route.abort();
    } else await route.continue();
  });
  await page.reload();
  await expect(tests).toContainText("Original code: 6 / 6 tests passed");
  expect(reruns).toBe(0);
});
