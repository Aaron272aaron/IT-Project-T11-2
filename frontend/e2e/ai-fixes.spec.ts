import { test, expect, type Page } from "@playwright/test";

const code = "def clean_text(s)\n    return s.strip().lower()";
const fixed = code.replace(/\)\n/, "):\n");
const repaired = {
  status: "repaired",
  originalCode: code,
  suggestedCode: fixed,
  syntaxError: { message: "expected ':'", line: 1 },
  diff: [
    "--- Original response",
    "+++ AI suggestion",
    `-${code.split("\n")[0]}`,
    `+${fixed.split("\n")[0]}`,
  ],
  message: "Suggested syntax fix. Review the changes before marking.",
  modelId: "mock-model",
};
async function openStudent(page: Page, student = "demo001") {
  const login = page.getByRole("button", { name: "Explore demo workspace" });
  if (await login.isVisible()) {
    await login.click();
    await page.getByLabel("Demo perspective").selectOption("Tutor");
  }
  await page.goto(`/#/question/5/mark/${student}`);
  await expect(page.getByTestId("student-answer")).toBeVisible();
}
async function review(page: Page) {
  await page
    .getByRole("button", { name: "Review AI correction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const data = JSON.parse(sessionStorage.getItem("automarktic-demo-v1")!);
    data.answers.comp10001 = data.answers.comp10001.filter(
      (answer: { question: number; id: string }) =>
        answer.question === 5 && ["demo001", "demo002"].includes(answer.id),
    );
    data.answers.comp10001.find(
      (answer: { id: string }) => answer.id === "demo002",
    ).original = "";
    sessionStorage.setItem("automarktic-demo-v1", JSON.stringify(data));
  });
});

test("coordinator automatically reviews valid code with the real API", async ({
  page,
}) => {
  await page.evaluate(() => {
    const data = JSON.parse(sessionStorage.getItem("automarktic-demo-v1")!);
    data.answers.comp10001.find(
      (answer: { id: string }) => answer.id === "demo001",
    ).original = "";
    data.answers.comp10001.find(
      (answer: { id: string }) => answer.id === "demo002",
    ).original = "pass";
    sessionStorage.setItem("automarktic-demo-v1", JSON.stringify(data));
  });
  const response = page.waitForResponse("**/api/ai/suggest-fix");
  await openStudent(page, "demo002");
  await page.getByLabel("Demo perspective").selectOption("Coordinator");
  expect((await response).status()).toBe(200);
  await expect(
    page
      .getByRole("region", { name: "Automatic AI correction" })
      .getByRole("status"),
  ).toContainText("No syntax fix is needed");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("ai-preview")).toHaveCount(0);
});

test("an unavailable model shows setup and retry while marking stays available", async ({
  page,
}) => {
  const response = page.waitForResponse("**/api/ai/suggest-fix");
  await openStudent(page);
  expect((await response).status()).toBe(503);
  await expect(
    page
      .getByRole("region", { name: "Automatic AI correction" })
      .getByRole("alert"),
  ).toContainText("continue marking manually");
  await expect(
    page.getByRole("progressbar", { name: "AI correction progress" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Confirm and next response",
      exact: true,
    }),
  ).toBeVisible();
  await page.route("**/api/ai/suggest-fix", (route) =>
    route.fulfill({ json: repaired }),
  );
  await page
    .getByRole("button", { name: "Retry AI correction", exact: true })
    .click();
  await expect(page.getByTestId("ai-preview")).toHaveText(fixed);
});

test("automatic generation shows progress and retains the prepared comparison without changing marks", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  const suggestion = fixed.replace("    return", "\treturn");
  await page.route("**/api/ai/suggest-fix", async (route) => {
    requests++;
    expect(route.request().postDataJSON()).toEqual({ code });
    await pending;
    await route.fulfill({
      json: {
        ...repaired,
        suggestedCode: suggestion,
        diff: [
          "--- Original response",
          "+++ AI suggestion",
          "@@ -1,2 +1,2 @@",
          ...code.split("\n").map((line) => `-${line}`),
          ...suggestion.split("\n").map((line) => `+${line}`),
        ],
      },
    });
  });
  const before = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("automarktic-demo-v1")!).answers,
  );
  const sent = page.waitForRequest("**/api/ai/suggest-fix");
  await openStudent(page);
  await sent;
  const progress = page.getByRole("progressbar", {
    name: "AI correction progress",
  });
  await expect(progress).toBeVisible();
  expect(await progress.getAttribute("value")).toBeNull();
  await expect(
    page.getByRole("button", { name: "Review AI correction", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("region", { name: "Automatic AI correction" })
    .screenshot({ path: "test-results/automatic-ai-progress.png" });
  release();
  await expect(progress).toHaveCount(0);
  await expect(page.getByTestId("ai-preview")).toHaveText(suggestion);
  await expect(page.getByTestId("student-answer")).toHaveText(code);
  await page
    .getByRole("region", { name: "Automatic AI correction" })
    .screenshot({ path: "test-results/automatic-ai-correction.png" });
  await review(page);
  await expect(page.getByTestId("ai-original")).toHaveText(code);
  await expect(page.getByTestId("ai-suggestion")).toHaveText(suggestion);
  expect(await page.locator(".ai-diff-added").allTextContents()).toEqual([
    ":",
    "\t",
  ]);
  expect(await page.locator(".ai-diff-removed").allTextContents()).toEqual([
    "    ",
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const originalBox = await page.getByTestId("ai-original").boundingBox();
  const suggestionBox = await page.getByTestId("ai-suggestion").boundingBox();
  expect(suggestionBox!.y).toBeGreaterThan(originalBox!.y);
  await page.keyboard.press("Escape");
  await review(page);
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Reject recommendation" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Recommendation rejected.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("automarktic-demo-v1")!).answers,
    ),
  ).toEqual(before);
});

test("navigating away keeps the batch running without showing the previous student correction", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/ai/suggest-fix", async (route) => {
    const submitted = route.request().postDataJSON().code;
    if (submitted === code) {
      await pending;
      await route.fulfill({ json: repaired }).catch(() => {});
    } else {
      await route.fulfill({
        json: {
          status: "already_valid",
          originalCode: submitted,
          suggestedCode: null,
          syntaxError: null,
          diff: [],
          modelId: null,
          message: "No syntax fix is needed.",
        },
      });
    }
  });
  await page.evaluate(() => {
    const data = JSON.parse(sessionStorage.getItem("automarktic-demo-v1")!);
    data.answers.comp10001.find(
      (answer: { id: string }) => answer.id === "demo002",
    ).original = "pass";
    sessionStorage.setItem("automarktic-demo-v1", JSON.stringify(data));
  });
  const sent = page.waitForRequest("**/api/ai/suggest-fix");
  await openStudent(page);
  await sent;
  await expect(
    page.getByRole("progressbar", { name: "AI correction progress" }),
  ).toBeVisible();
  await openStudent(page, "demo002");
  release();
  await expect(
    page
      .getByRole("region", { name: "Automatic AI correction" })
      .getByRole("status"),
  ).toHaveText("No syntax fix is needed.");
  await expect(page.getByTestId("ai-preview")).toHaveCount(0);
  await expect(page.getByTestId("student-answer")).not.toHaveText(code);
});

test("regeneration sends the marker comment and closing its window allows it to finish", async ({
  page,
}) => {
  const comment = "Add the missing colon on line 1; keep the return statement.";
  const requests: { code: string; comment?: string }[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/ai/suggest-fix", async (route) => {
    const payload = route.request().postDataJSON();
    requests.push(payload);
    if (payload.comment) await pending;
    await route.fulfill({ json: repaired });
  });
  await openStudent(page);
  await expect(page.getByTestId("ai-preview")).toHaveText(fixed);
  expect(requests).toEqual([{ code }]);
  await review(page);
  await page
    .getByLabel("Comment for AI (optional)", { exact: true })
    .fill(comment);
  await page
    .getByRole("button", { name: "Generate again", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("progressbar")).toBeVisible();
  await page.keyboard.press("Escape");
  release();
  await expect(page.getByTestId("ai-preview")).toHaveText(fixed);
  expect(requests).toEqual([{ code }, { code, comment }]);
  await expect(page.getByTestId("student-answer")).toHaveText(code);
  await review(page);
  await expect(
    page.getByLabel("Comment for AI (optional)", { exact: true }),
  ).toHaveValue(comment);
  await expect(
    page.getByRole("button", { name: "Replace original code", exact: true }),
  ).toHaveCount(0);
  expect(requests).toHaveLength(2);
});

test("a busy model retries automatically and finishes the correction", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/ai/suggest-fix", async (route) => {
    requests++;
    await route.fulfill(
      requests === 1
        ? {
            status: 429,
            json: { message: "AI is reviewing another response." },
          }
        : { json: repaired },
    );
  });
  await openStudent(page);

  await expect(
    page.getByRole("progressbar", { name: "AI correction progress" }),
  ).toBeVisible();
  await expect(page.getByTestId("ai-preview")).toHaveText(fixed);
  expect(requests).toBe(2);
});

test("a timed-out correction stops progress and offers retry", async ({
  page,
}) => {
  await page.clock.install();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/ai/suggest-fix", async (route) => {
    await pending;
    await route.fulfill({ json: repaired }).catch(() => {});
  });
  const sent = page.waitForRequest("**/api/ai/suggest-fix");
  await openStudent(page);
  await sent;
  await page.clock.fastForward(120_000);
  await expect(
    page
      .getByRole("region", { name: "Automatic AI correction" })
      .getByRole("alert"),
  ).toContainText("took too long");
  await expect(
    page.getByRole("progressbar", { name: "AI correction progress" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry AI correction", exact: true }),
  ).toBeVisible();
  release();
  await expect(page.getByTestId("ai-preview")).toHaveCount(0);
});
