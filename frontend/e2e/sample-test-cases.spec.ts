import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

async function openAnswer(page: Page, questionId: string, source: string) {
  await page.route("**/demo/sample-exam.json", async (route) => {
    const sample = await (await route.fetch()).json();
    const student = sample.answers.preview.students[0];
    student.id = "SyntheticDemo";
    student.canvasId = "synthetic";
    student.answers.find(
      (answer: { questionId: string }) => answer.questionId === questionId,
    ).original = source;
    sample.answers.preview.students = [student];
    await route.fulfill({ json: sample });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await page.goto(`/#/exam/final/question/${questionId}/mark/SyntheticDemo`);
  await expect(page.getByTestId("sample-answer")).toHaveText(source);
}

async function runAndPreserve(page: Page, button: string, result: string) {
  const original = await page.getByTestId("sample-answer").textContent();
  const before = await page.evaluate(() =>
    localStorage.getItem("automarktic-exams-v1"),
  );
  await page.getByRole("button", { name: button, exact: true }).click();
  await expect(page.getByRole("status")).toContainText(result, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("sample-answer")).toHaveText(original!);
  expect(
    await page.evaluate(() => localStorage.getItem("automarktic-exams-v1")),
  ).toBe(before);
}

test("expression output has no answer-checking runner", async ({ page }) => {
  await openAnswer(page, "3081164", "11 int");
  await expect(page.getByText("Answer checks and test results", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check original answer", exact: true })).toHaveCount(0);
});

test("single assignment runs context cases without changing the student's answer or mark", async ({
  page,
}) => {
  await openAnswer(page, "3081168", "has_zero = 0 in values");
  await runAndPreserve(
    page,
    "Run original tests",
    "Original code: 7 / 7 tests passed",
  );
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.screenshot({
    path: "runner-test-results/sample-assignment-tests.png",
    fullPage: true,
  });
});

test("code completion supplies the surrounding function and reports a missing colon", async ({
  page,
}) => {
  await openAnswer(page, "3081179", "if query == nums[i]");
  await runAndPreserve(
    page,
    "Run original tests",
    "Original code: 0 / 8 tests passed",
  );
  await expect(
    page
      .getByRole("table", { name: "Original code test cases" })
      .getByText(/expected ':'/),
  ).toHaveCount(8);
});

test("most common letter includes alphabetical tie cases", async ({ page }) => {
  const source = readFileSync(
    new URL(
      "../../auto_marking/test_runner/reference_answers/canvas-3081195.py",
      import.meta.url,
    ),
    "utf8",
  );
  await openAnswer(page, "3081195", source);
  await runAndPreserve(
    page,
    "Run original tests",
    "Original code: 7 / 7 tests passed",
  );
});

test("best word accepts optimal tied outputs against orthogonal paths", async ({
  page,
}) => {
  const source = readFileSync(
    new URL(
      "../../auto_marking/test_runner/reference_answers/canvas-3081196.py",
      import.meta.url,
    ),
    "utf8",
  );
  await openAnswer(page, "3081196", source);
  await runAndPreserve(
    page,
    "Run original tests",
    "Original code: 7 / 7 tests passed",
  );
});

test("questions requiring explanation or missing an answer key show manual review guidance", async ({
  page,
}) => {
  await openAnswer(page, "3081198", "Synthetic explanation for manual review.");
  await expect(page.getByText("Answer checks and test results", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run original tests", exact: true })).toHaveCount(0);
  await page.goto("/#/exam/final/question/3081173/mark/SyntheticDemo");
  await expect(
    page.getByText("Human review required", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("The supplied CSV omits the choices", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Check original answer", exact: true }),
  ).toHaveCount(0);
});
