import { test, expect } from "@playwright/test";

test("Q32 runs original and real AI-repaired code separately without changing marks", async ({
  page,
}) => {
  // Supply synthetic code in this isolated browser, preserving the real user's answers.
  const broken =
    "def similarity(board, char)\n    return sum(row.count(char) for row in board)\n";
  await page.route("**/demo/sample-exam.json", async (route) => {
    const response = await route.fetch();
    const sample = await response.json();
    sample.answers.preview.students[0].answers.find(
      (a: { questionId: string }) => a.questionId === "3081194",
    ).original = broken;
    await route.fulfill({ json: sample });
  });
  await page.goto("/");
  await page.getByLabel("Email or Username").fill("demo");
  await page.getByLabel("Password", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await page.goto("/#/exam/final/question/3081194");
  const aiRequest = page.waitForRequest("**/api/ai/suggest-fix");
  await page
    .getByRole("button", { name: /^Mark / })
    .first()
    .click();
  await expect(page.getByTestId("sample-answer")).toHaveText(broken);
  const before = await page.evaluate(() =>
    sessionStorage.getItem("automarktic-exams-v1"),
  );
  const originalRequest = page.waitForRequest("**/api/test-runs");
  await page
    .getByRole("button", { name: "Run original tests", exact: true })
    .click();
  expect((await originalRequest).headers()["x-automarktic-demo"]).toBe("1");
  await expect(
    page
      .getByRole("region", { name: "Original code test results" })
      .getByRole("status"),
  ).toContainText("Original code: 0 / 6 tests passed", { timeout: 30_000 });
  await expect(
    page
      .getByRole("table", { name: "Original code test cases" })
      .getByText("expected ':' (line 1)"),
  ).toHaveCount(6);
  await page
    .getByRole("button", { name: "Review AI correction" })
    .click({ timeout: 120_000 });
  expect((await aiRequest).headers()["x-automarktic-demo"]).toBe("1");
  await expect(page.getByTestId("ai-suggestion")).toContainText(
    "def similarity(board, char):",
    { timeout: 120_000 },
  );
  await page
    .getByRole("button", { name: "Run recommendation tests", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "AI recommendation test results" })
      .getByRole("status"),
  ).toContainText("AI recommendation: 6 / 6 tests passed", { timeout: 30_000 });
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page
    .getByRole("dialog")
    .screenshot({ path: "runner-test-results/runner-before-after.png" });
  await page.getByRole("button", { name: "Reject recommendation" }).click();
  await expect(
    page
      .getByRole("region", { name: "Original code test results" })
      .getByRole("status"),
  ).toContainText("Original code: 0 / 6 tests passed");
  await expect(page.getByTestId("sample-answer")).toHaveText(broken);
  expect(
    await page.evaluate(() => sessionStorage.getItem("automarktic-exams-v1")),
  ).toBe(before);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
