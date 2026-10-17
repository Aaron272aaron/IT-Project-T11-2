import { test, expect } from "@playwright/test";
import { canvasExampleCsv } from "../src/models/canvasCsv";
test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => {
      throw new Error("Unexpected backend request: " + route.request().url());
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await page.goto("/#/exam/final");
  await expect(
    page.getByRole("heading", { name: "Sample exam", exact: true }),
  ).toBeVisible();
});
test("creates a rubric and marks answers in a newly created exam", async ({
  page,
}) => {
  await page.goto("/#/create-exam");
  await page.getByLabel("Exam name *").fill("Custom rubric workflow");
  await page.getByRole("button", { name: "Create exam", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Custom rubric workflow", exact: true }),
  ).toBeVisible();
  const examUrl = page.url();
  await page
    .getByRole("button", { name: "Upload answer CSV", exact: true })
    .click();
  await page.getByLabel("Answer CSV file").setInputFiles({
    name: "answers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(canvasExampleCsv),
  });
  await page
    .getByRole("button", { name: "Validate and preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save answers to exam", exact: true })
    .click();
  await expect(page).toHaveURL(examUrl);
  await page.getByText("Rubric options by question", { exact: true }).click();
  await page.getByRole("button", { name: "Add option", exact: true }).click();
  await page.getByLabel("Option 1 score", { exact: true }).fill("1");
  await page
    .getByLabel("Option 1 description", { exact: true })
    .fill("Meets the requirement");
  await page
    .getByRole("button", { name: "Save rubric options", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm rubric changes", exact: true })
    .click();
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await page
    .getByRole("button", { name: "Open question 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^Mark / })
    .first()
    .click();
  await page.getByRole("radio").first().check();
  const markingUrl = page.url();
  await page
    .getByRole("button", { name: "Confirm and next response", exact: true })
    .click();
  await expect(page).not.toHaveURL(markingUrl);
  await page.goto(markingUrl);
  await page.reload();
  await expect(page.getByText(/Saved mark: 1 \/ /)).toBeVisible();
  await page.locator(".mark-decision").screenshot({
    path: "test-results/non-grouped-mark-decision.png",
  });
  await page
    .getByRole("button", { name: "Back to question", exact: true })
    .click();
  await page.getByRole("button", { name: "Back to exam", exact: true }).click();
  await expect(page).toHaveURL(examUrl);
});

test("sample tests and rubric draft work without a backend", async ({
  page,
}) => {
  await page.getByText("Rubric options by question", { exact: true }).click();
  await page
    .getByText("Automatically create rubric from document", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Read saved rubric document", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply imported draft", exact: true }),
  ).toBeVisible();
  await page.goto("/#/exam/final/question/3081168/mark/1674263");
  await page
    .getByRole("button", { name: "Run original tests", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "Original code test cases" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("sample-answer")).toBeVisible();
});
