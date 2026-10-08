import { test, expect } from "@playwright/test";
import { canvasExampleCsv } from "../src/models/canvasCsv";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await page.goto("/#/exam/final");
  await page
    .getByRole("button", { name: "Upload answer CSV", exact: true })
    .click();
});

test("previews a Canvas file through the real Python module without changing demo answers", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) requests.push(request.url());
  });
  const before = await page.evaluate(() =>
    sessionStorage.getItem("automarktic-demo-v1"),
  );
  await page.getByLabel("Answer CSV file").setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(canvasExampleCsv),
  });
  // Observe the real response: a client-only parser cannot pass this assertion.
  const responsePromise = page.waitForResponse((r) =>
    r.url().endsWith("/api/canvas/preview"),
  );
  await page.getByRole("button", { name: "Validate and preview" }).click();
  const response = await responsePromise;
  expect(response.request().method()).toBe("POST");
  // Chrome does not expose File upload bytes through postDataBuffer().
  // Assert the upload type here; Python tests verify exact original bytes.
  expect(response.request().headers()["content-type"]).toBe("text/csv");
  expect(response.status()).toBe(200);
  expect((await response.json()).parser).toBe("csv import.py");
  await expect(
    page.getByText("Processed by Python · csv import.py"),
  ).toBeVisible();
  await expect(
    page.getByText("CSV validated · Preview ready", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".canvas-summary")).toContainText(
    "Section introductions",
  );
  await page.getByLabel("Question or section").selectOption("102");
  expect(await page.getByTestId("canvas-answer").textContent()).toBe(
    "def example():\n    return 1",
  );
  await page.getByLabel("Question or section").selectOption("101");
  await page.getByLabel("Student", { exact: true }).selectOption("test002");
  await expect(
    page.getByText("Blank answer retained for review.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search student ID").fill("not-present");
  await expect(page.getByText("No students match this ID.")).toBeVisible();
  await page.getByLabel("Search student ID").fill("");
  expect(requests).toHaveLength(1);
  expect(
    await page.evaluate(() => sessionStorage.getItem("automarktic-demo-v1")),
  ).toBe(before);
  // Capture the top of the page after responsive transitions have settled.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    animations: "disabled",
    path: "test-results/canvas-upload-preview.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Original answer preview" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Validate and preview" }),
  ).toBeDisabled();
});

test("blocks invalid files, allows correction, and clears the preview", async ({
  page,
}) => {
  await page.getByLabel("Answer CSV file").setInputFiles({
    name: "wrong.xlsx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("wrong"),
  });
  await expect(page.getByRole("alert")).toContainText("Choose a .csv file");
  await page.getByLabel("Answer CSV file").setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([0xff, 0xfe, 0x00]),
  });
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(
    page.getByRole("cell", { name: /Cannot parse CSV.*UTF-8/ }),
  ).toBeVisible();
  await page.getByLabel("Answer CSV file").setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("student_id,question_id,answer\ns1,1,hello"),
  });
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(
    page.getByText("Preview blocked: fix the CSV errors"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Original answer preview" }),
  ).toHaveCount(0);
  await page.getByLabel("Answer CSV file").setInputFiles({
    name: "valid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(canvasExampleCsv),
  });
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Original answer preview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear file", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Original answer preview" }),
  ).toHaveCount(0);
});

test("upload and answer preview fit a narrow mobile screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Answer CSV file").setInputFiles({
    name: "a-very-long-file-name-that-must-wrap-on-mobile-quiz-report.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(canvasExampleCsv),
  });
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Original answer preview" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // Capture the top of the page after responsive transitions have settled.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    animations: "disabled",
    path: "test-results/canvas-upload-mobile.png",
    fullPage: true,
  });
});

// This optional local test verifies the supplied file without committing student
// data into test fixtures or screenshots. CI can run the synthetic tests alone.
test("supplied Canvas report has 4 students, 37 questions and 7 introductions", async ({
  page,
}) => {
  test.skip(
    !process.env.CANVAS_TEST_CSV,
    "Set CANVAS_TEST_CSV to a local report path.",
  );
  await page
    .getByLabel("Answer CSV file")
    .setInputFiles(process.env.CANVAS_TEST_CSV!);
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(
    page.getByText("CSV validated · Preview ready", { exact: true }),
  ).toBeVisible();
  const numbers = page.locator(".canvas-summary strong");
  await expect(numbers).toHaveText(["4", "37", "7", "148"]);
  await expect(
    page.getByText(
      "176 total records including section introductions. Rubric not supplied.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "0 errors · 78 warnings",
  );
  await page.getByLabel("Question or section").selectOption("3081194");
  await expect(page.getByTestId("canvas-question")).toContainText("similarity");
});

// A retry must reach Python; there is no hidden fallback to frontend parsing.
test("Python failure clears old success and a retry works", async ({
  page,
}) => {
  await page.getByLabel("Answer CSV file").setInputFiles({
    name: "sample.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(canvasExampleCsv),
  });
  const submit = page.getByRole("button", { name: "Validate and preview" });
  await submit.click();
  await expect(page.getByTestId("canvas-answer")).toBeVisible();
  await page.route("**/api/canvas/preview", (route) =>
    route.abort("connectionrefused"),
  );
  await submit.click();
  await expect(page.getByRole("alert")).toContainText("Cannot reach Python");
  await expect(page.getByTestId("canvas-answer")).toHaveCount(0);
  await expect(submit).toBeEnabled();
  await page.unroute("**/api/canvas/preview");
  await submit.click();
  await expect(page.getByTestId("canvas-answer")).toBeVisible();
});

// Clear remains usable during a slow upload, and its late reply is discarded.
test("clearing a pending request prevents stale answers from returning", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/canvas/preview", async (route) => {
    await held;
    await route.abort();
  });
  await page.getByLabel("Answer CSV file").setInputFiles({
    name: "sample.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(canvasExampleCsv),
  });
  const sent = page.waitForRequest("**/api/canvas/preview");
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await sent;
  await expect(
    page.getByRole("button", { name: "Waiting for Python…" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Clear file", exact: true }).click();
  release();
  await page.unrouteAll({ behavior: "wait" });
  await expect(page.getByTestId("canvas-answer")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Validate and preview" }),
  ).toBeDisabled();
});
