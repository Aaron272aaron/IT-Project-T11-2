import { test, expect } from "@playwright/test";
import { pdf } from "./pdf-fixture";
import { readFile } from "node:fs/promises";
import { canvasExampleCsv } from "../src/canvasCsv";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
});

test("coordinator can still preview, move and resize the document", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/exam/final");
  await page.getByLabel("Rubric file (optional)").setInputFiles(pdf());
  await page.getByRole("button", { name: "Save rubric", exact: true }).click();
  await expect(page.locator(".rubric-assignments")).toHaveCount(0);
  await page.goto("/#/question/1/mark/demo001");
  await page.getByRole("button", { name: "View rubric", exact: true }).click();
  const window = page.getByRole("dialog", { name: "Rubric preview" });
  await expect(window.getByLabel("Rubric page", { exact: true })).toHaveValue(
    "1",
  );
  await expect(
    window.getByRole("img", { name: "Rubric page 1" }),
  ).toBeVisible();
  // Check pixels were actually rendered, not only the navigation label.
  expect(
    await window.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let dark = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          data[i] < 100 &&
          data[i + 1] < 100 &&
          data[i + 2] < 100 &&
          data[i + 3] > 0
        )
          dark++;
      return dark;
    }),
  ).toBeGreaterThan(100);
  const before = (await window.boundingBox())!;
  const handle = (await window
    .getByRole("button", { name: "Move rubric window" })
    .boundingBox())!;
  await page.mouse.move(handle.x + 50, handle.y + 10);
  await page.mouse.down();
  await page.mouse.move(handle.x - 140, handle.y + 20);
  await page.mouse.up();
  const moved = (await window.boundingBox())!;
  expect(moved.x).toBeLessThan(before.x - 100);
  const corner = (await window
    .getByRole("button", { name: "Resize rubric window" })
    .boundingBox())!;
  await page.mouse.move(corner.x + 10, corner.y + 10);
  await page.mouse.down();
  await page.mouse.move(corner.x + 90, corner.y - 80);
  await page.mouse.up();
  const resized = (await window.boundingBox())!;
  expect(resized.width).toBeGreaterThan(moved.width + 50);
  expect(resized.height).toBeLessThan(moved.height - 50);
  await window.getByRole("button", { name: "Next page" }).click();
  await expect(
    window.getByRole("img", { name: "Rubric page 2" }),
  ).toBeVisible();
  const sizes = await window.evaluate((el) => ({
    window: el.getBoundingClientRect().toJSON(),
    canvas: el.querySelector("canvas")!.getBoundingClientRect().toJSON(),
    style: el.querySelector("canvas")!.getAttribute("style"),
    viewport: innerWidth,
  }));
  expect(sizes.canvas.width).toBeGreaterThan(sizes.window.width - 65);
  await page.screenshot({ path: "test-results/tutor-rubric-window.png" });
  await window.getByRole("button", { name: "Close rubric" }).click();
  await expect(window).toHaveCount(0);
  await page.getByRole("radio").first().check();
  await page
    .getByRole("button", { name: "Confirm category & mark", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Final mark saved");
  expect(errors).toEqual([]);
});

test("rubric replacement remains available without page assignments", async ({
  page,
}) => {
  await page.goto("/#/exam/final");
  await page.getByLabel("Rubric file (optional)").setInputFiles(pdf());
  await page.getByRole("button", { name: "Save rubric", exact: true }).click();
  await page
    .getByLabel("Rubric file (optional)")
    .setInputFiles(pdf("replacement.pdf", 1));
  await page
    .getByRole("button", { name: "Replace rubric", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".saved-attachment")).toContainText(
    "replacement.pdf",
  );
  await expect(page.locator(".rubric-assignments")).toHaveCount(0);
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await page.goto("/#/question/1/mark/demo001");
  await expect(
    page.getByRole("button", { name: "View rubric", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("radio").first()).toBeVisible();
});

test("tutor perspective persists and blocks direct management routes", async ({
  page,
}) => {
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await expect(
    page.getByRole("button", { name: "Create exam", exact: true }),
  ).toHaveCount(0);
  for (const route of [
    "/create-exam",
    "/exam/final/answers/upload",
    "/exam/final/review",
    "/workspace-settings",
    "/members",
    "/exam/final/import",
  ]) {
    await page.goto("/#" + route);
    await expect(
      page.getByRole("heading", { name: "Coordinator view required" }),
    ).toBeVisible();
  }
  await page.reload();
  await expect(page.getByLabel("Demo perspective")).toHaveValue("Tutor");
  await page.getByLabel("Demo perspective").selectOption("Coordinator");
  await expect(
    page.getByRole("heading", { name: "Coordinator view required" }),
  ).toHaveCount(0);
});

test("uploaded answers remain accessible to tutors without the document button", async ({
  page,
}) => {
  await page.goto("/#/create-exam");
  await page.getByLabel("Exam name *").fill("Real question mapping");
  await page.getByLabel("Rubric file (optional)").setInputFiles(pdf());
  await expect(page.getByText("Selected:", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Create exam", exact: true }).click();
  const examUrl = page.url();
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
  await expect(page).toHaveURL(examUrl);
  await expect(page.locator(".rubric-assignments")).toHaveCount(0);
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await page.getByRole("button", { name: "View uploaded answers" }).click();
  await page.getByLabel("Question or section").selectOption("102");
  await expect(
    page.getByRole("button", { name: "View rubric", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Question or section").selectOption("101");
  await expect(
    page.getByRole("button", { name: "View rubric", exact: true }),
  ).toHaveCount(0);
});

test("corrupt PDFs and old DOC files fail without replacing the saved rubric", async ({
  page,
}) => {
  await page.goto("/#/exam/final");
  await page.getByLabel("Rubric file (optional)").setInputFiles(pdf());
  await page.getByRole("button", { name: "Save rubric", exact: true }).click();
  await page.getByLabel("Rubric file (optional)").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 invalid"),
  });
  await expect(page.getByRole("alert")).toContainText("valid, unencrypted PDF");
  await expect(
    page.getByRole("button", { name: "Replace rubric" }),
  ).toBeDisabled();
  await page.getByLabel("Rubric file (optional)").setInputFiles({
    name: "old.doc",
    mimeType: "application/msword",
    buffer: Buffer.from("old"),
  });
  await expect(page.getByRole("alert")).toContainText(".docx");
  await expect(page.locator(".saved-attachment")).toContainText("rubric.pdf");
});

test("rubric window fits mobile and remains operable by keyboard", async ({
  page,
}) => {
  await page.goto("/#/exam/final");
  await page.getByLabel("Rubric file (optional)").setInputFiles(pdf());
  await page.getByRole("button", { name: "Save rubric", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/question/1/mark/demo001");
  await page.getByRole("button", { name: "View rubric", exact: true }).click();
  const window = page.getByRole("dialog", { name: "Rubric preview" });
  await expect(window.getByRole("img")).toBeVisible();
  await window.getByRole("button", { name: "Resize rubric window" }).focus();
  await page.keyboard.press("ArrowLeft");
  const box = (await window.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/rubric-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(window).toHaveCount(0);
});

// This opt-in test uses the user's originals read-only and exercises their combined storage size.
test("real Word rubric and Canvas answers survive save and refresh without tutor preview", async ({
  page,
}) => {
  test.skip(
    !process.env.RUBRIC_TEST_DOCX || !process.env.CANVAS_TEST_CSV,
    "Provide the original local fixtures",
  );
  test.setTimeout(90000);
  await page.goto("/#/exam/final");
  await page
    .getByLabel("Rubric file (optional)")
    .setInputFiles(process.env.RUBRIC_TEST_DOCX!);
  await expect(
    page.getByRole("button", { name: "Save rubric", exact: true }),
  ).toBeEnabled({ timeout: 75000 });
  await page.getByRole("button", { name: "Save rubric", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download rubric", exact: true })
    .click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!)).toEqual(
    await readFile(process.env.RUBRIC_TEST_DOCX!),
  );
  await page
    .getByRole("button", { name: "Upload answer CSV", exact: true })
    .click();
  await page
    .getByLabel("Answer CSV file")
    .setInputFiles(process.env.CANVAS_TEST_CSV!);
  await page
    .getByRole("button", { name: "Validate and preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save answers to exam", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".saved-attachment")).toBeVisible();
  await expect(page.locator(".rubric-assignments")).toHaveCount(0);
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await page.getByRole("button", { name: "View uploaded answers" }).click();
  await expect(
    page.getByRole("button", { name: "View rubric", exact: true }),
  ).toHaveCount(0);
});
