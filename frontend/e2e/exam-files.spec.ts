import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { canvasExampleCsv } from "../src/canvasCsv";

import { pdf } from "./pdf-fixture";
async function createExam(page: Page, name: string) {
  await page.goto("/#/create-exam");
  await page.getByLabel("Exam name *").fill(name);
  await page.getByRole("button", { name: "Create exam", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  return page.url();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
});

test("creates an exam without a rubric and moves answer upload inside that exam", async ({
  page,
}) => {
  await expect(
    page.getByRole("button", { name: "Upload answer CSV", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Create exam", exact: true }).click();
  await expect(page.getByLabel("Rubric file (optional)")).toBeVisible();
  await page.getByLabel("Exam name *").fill("Optional rubric exam");
  await page.getByRole("button", { name: "Create exam", exact: true }).click();
  await expect(
    page.getByText("No rubric uploaded. You can still upload answers."),
  ).toBeVisible();
  const url = page.url();
  await page
    .getByRole("button", { name: "Upload answer CSV", exact: true })
    .click();
  expect(page.url()).toBe(url + "/answers/upload");
  await expect(
    page.getByText("Answers for Optional rubric exam.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to exam", exact: true }).click();
  expect(page.url()).toBe(url);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Optional rubric exam", exact: true }),
  ).toBeVisible();
  await page.goto("/#/import/canvas");
  await expect(page).toHaveURL(/#\/exams$/);
});

test("creates with a rubric, downloads original bytes and replaces only after saving", async ({
  page,
}) => {
  await page.goto("/#/create-exam");
  await page.getByLabel("Exam name *").fill("Rubric exam");
  await page.screenshot({
    path: "test-results/create-exam.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("Rubric file (optional)").setInputFiles(pdf());
  await expect(
    page.getByText("Selected: rubric.pdf", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create exam", exact: true }).click();
  const rubric = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Exam rubric", exact: true }),
  });
  await expect(rubric.locator(".saved-attachment")).toContainText("rubric.pdf");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download rubric" }).click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!)).toEqual(pdf().buffer);
  await page.getByLabel("Rubric file (optional)").setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("a,b"),
  });
  await expect(page.getByRole("alert")).toContainText("not a CSV");
  await expect(rubric.locator(".saved-attachment")).toContainText("rubric.pdf");
  await page
    .getByLabel("Rubric file (optional)")
    .setInputFiles(pdf("updated.pdf"));
  await expect(
    page.getByRole("button", { name: "Replace rubric" }),
  ).toBeEnabled();
  await expect(rubric.locator(".saved-attachment")).toContainText("rubric.pdf");
  await page.getByRole("button", { name: "Replace rubric" }).click();
  await page.reload();
  await expect(rubric.locator(".saved-attachment")).toContainText(
    "updated.pdf",
  );
});

test("saves Python-validated answers to one exam and retains them after refresh", async ({
  page,
}) => {
  const first = await createExam(page, "First exam");
  await page
    .getByRole("button", { name: "Upload answer CSV", exact: true })
    .click();
  await page.getByLabel("Answer CSV file").setInputFiles({
    name: "answers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(canvasExampleCsv),
  });
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await page.getByRole("button", { name: "Save answers to exam" }).click();
  await expect(page).toHaveURL(first);
  await expect(
    page.getByText("2 students · 2 questions", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "View uploaded answers" }).click();
  await page.getByLabel("Question or section").selectOption("102");
  await expect(page.getByTestId("canvas-answer")).toHaveText(
    "def example():\n    return 1",
  );
  await createExam(page, "Second exam");
  await expect(page.getByText("No answer CSV uploaded yet.")).toBeVisible();
  await page.goto(first);
  await page.getByLabel("Rubric file (optional)").setInputFiles(pdf());
  await page.getByRole("button", { name: "Save rubric" }).click();
  await page.getByRole("button", { name: "View uploaded answers" }).click();
  await expect(page.locator(".canvas-summary strong")).toHaveText([
    "2",
    "2",
    "1",
    "4",
  ]);
  // A workspace change must not make a foreign exam address resolve.
  await page.goto("/#/create-workspace");
  await page.getByLabel("Workspace name *").fill("Other workspace");
  await page.getByLabel("Subject *").fill("Other subject");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page.goto(first);
  await expect(
    page.getByRole("heading", { name: "Exam not found" }),
  ).toBeVisible();
});

test("storage failure retains the old rubric and reports failure", async ({
  page,
}) => {
  await createExam(page, "Storage exam");
  await page.getByLabel("Rubric file (optional)").setInputFiles(pdf());
  await page.getByRole("button", { name: "Save rubric" }).click();
  await expect(page.locator(".saved-attachment")).toContainText("rubric.pdf");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "automarktic-exams-v1")
        throw new DOMException("Full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.getByLabel("Rubric file (optional)").setInputFiles(pdf("new.pdf"));
  await page.getByRole("button", { name: "Replace rubric" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "previous exam is unchanged",
  );
  await expect(page.locator(".saved-attachment")).toContainText("rubric.pdf");
});

test("rubric upload fits a mobile screen and accepts a real Word file", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/create-exam");
  await page.getByLabel("Exam name *").fill("Mobile exam");
  const input = page.getByLabel("Rubric file (optional)");
  if (process.env.RUBRIC_TEST_DOCX)
    await input.setInputFiles(process.env.RUBRIC_TEST_DOCX);
  else
    await input.setInputFiles(
      pdf("long-rubric-file-name-for-the-current-exam.pdf"),
    );
  await expect(page.getByText("Selected:", { exact: false })).toBeVisible({
    timeout: 90000,
  });
  await page.getByRole("button", { name: "Create exam", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Download rubric" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/exam-files-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

// Replacing answers is a separate explicit step; cancellation keeps old data.
test("answer replacement requires confirmation and preserves the rubric", async ({
  page,
}) => {
  const url = await createExam(page, "Replacement exam");
  await page.getByLabel("Rubric file (optional)").setInputFiles(pdf());
  await page.getByRole("button", { name: "Save rubric" }).click();
  await expect(page.locator(".saved-attachment")).toContainText("rubric.pdf");
  async function previewFile(name: string, content: string) {
    await page.goto(url + "/answers/upload");
    await page.getByLabel("Answer CSV file").setInputFiles({
      name,
      mimeType: "text/csv",
      buffer: Buffer.from(content),
    });
    await page.getByRole("button", { name: "Validate and preview" }).click();
    await expect(
      page.getByRole("button", { name: "Save answers to exam" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save answers to exam" }).click();
  }
  await previewFile("original.csv", canvasExampleCsv);
  await expect(page).toHaveURL(url);
  await previewFile(
    "replacement.csv",
    canvasExampleCsv.replace("return 1", "return 99"),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("button", { name: "Back to exam", exact: true }).click();
  await expect(page.getByText("original.csv", { exact: true })).toBeVisible();
  await previewFile(
    "replacement.csv",
    canvasExampleCsv.replace("return 1", "return 99"),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Replace answers", exact: true })
    .click();
  await expect(page).toHaveURL(url);
  await expect(page.locator(".saved-attachment")).toContainText("rubric.pdf");
  await page.reload();
  await page.getByRole("button", { name: "View uploaded answers" }).click();
  await page.getByLabel("Question or section").selectOption("102");
  await expect(page.getByTestId("canvas-answer")).toHaveText(
    "def example():\n    return 99",
  );
});
