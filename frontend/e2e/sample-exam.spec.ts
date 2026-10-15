import { test, expect } from "@playwright/test";

// Keep sample workflows offline; automatic AI review is the only expected backend request.
const apiRequests = new WeakMap<object, string[]>();

test.afterEach(async ({ page }) => {
  expect(
    (apiRequests.get(page) ?? []).every((url) =>
      url.endsWith("/api/ai/suggest-fix"),
    ),
  ).toBe(true);
});

test.beforeEach(async ({ page }) => {
  const requests: string[] = [];
  apiRequests.set(page, requests);
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    if (route.request().url().endsWith("/api/ai/model")) {
      await route.abort();
      return;
    }
    requests.push(route.request().url());
    if (route.request().url().endsWith("/api/ai/suggest-fix")) {
      const { code } = route.request().postDataJSON();
      await route.fulfill({
        json: {
          status: "already_valid",
          originalCode: code,
          suggestedCode: null,
          syntaxError: null,
          diff: [],
          modelId: null,
          message: "No syntax fix is needed.",
        },
      });
      return;
    }
    await route.abort();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Subject dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Sample exam", { exact: true })).toBeVisible();
  await page.goto("/#/exam/final");
  await expect(
    page.getByRole("heading", { name: "Sample exam", exact: true }),
  ).toBeVisible();
});

test("sample exam shows questions and rubric editing without page assignments", async ({
  page,
}) => {
  await expect(
    page.getByRole("button", { name: /Open question \d+$/ }),
  ).toHaveCount(37);
  await expect(
    page.getByText("Rubric pages by question", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".rubric-assignments")).toHaveCount(0);
  await expect(
    page.getByText("Rubric options by question", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sample exam", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".rubric-assignments")).toHaveCount(0);
});

test("coordinators and tutors open exams at the top without inheriting the previous scroll position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  for (const role of ["Coordinator", "Tutor"]) {
    await page.getByLabel("Demo perspective").selectOption(role);
    await page.goto("/#/exams");
    const open = page
      .getByRole("button", { name: "Open exam", exact: true })
      .first();
    await open.evaluate((button) => button.scrollIntoView({ block: "start" }));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(100);
    await open.click();
    await expect(
      page.getByRole("heading", { name: "Sample exam", exact: true }),
    ).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(100);
    await page
      .getByRole("button", { name: "Back to exams", exact: true })
      .click();
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Sample exam", exact: true }),
    ).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    // Re-rendering rubric controls on the same page must not jump back to the top.
    await page.evaluate(() => window.scrollTo(0, 300));
    await page
      .getByLabel("Demo perspective")
      .selectOption(role === "Tutor" ? "Coordinator" : "Tutor");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300);
  }
});

test("tutor marks a real response using supplied categories without a document button", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await expect(page.locator(".rubric-assignments")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open question 32", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^Mark / })
    .first()
    .click();
  const original = await page.getByTestId("sample-answer").textContent();
  const markingUrl = page.url();
  await expect(
    page.getByRole("button", { name: "Confirm category & mark", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "View rubric", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("radio", { name: "Option 2: 5 / 6", exact: true })
    .check();
  await expect(
    page.getByText("Final score: 5 / 6", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Marker comment (optional)")
    .fill("Demo human confirmation");
  await page
    .getByRole("button", { name: "Confirm and next response", exact: true })
    .click();
  await expect(page).not.toHaveURL(markingUrl);
  await page.goto(markingUrl);
  await page.reload();
  await expect(
    page.getByText("Saved mark: 5 / 6", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("sample-answer")).toHaveText(original!);
  await expect(
    page.getByRole("button", { name: "View rubric", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/sample-tutor.png",
    mask: [page.getByTestId("sample-answer")],
    fullPage: false,
  });
  expect(errors).toEqual([]);
});

test("automatic source scores are not misrepresented as new human confirmations", async ({
  page,
}) => {
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await page
    .getByRole("button", { name: "Open question 14", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^Mark / })
    .first()
    .click();
  await expect(
    page.getByText("This section is identified as automatically marked", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm category & mark", exact: true }),
  ).toHaveCount(0);
});

test("coordinator and tutor share the exam workspace and can both confirm marks", async ({
  page,
}) => {
  const questionsCard = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Questions", exact: true }),
  });
  const coordinatorRows = await questionsCard.locator("tbody").innerText();
  const questionsBox = await questionsCard.boundingBox();
  const filesBox = await page
    .getByRole("heading", { name: "Exam rubric", exact: true })
    .boundingBox();
  expect(questionsBox!.y).toBeLessThan(filesBox!.y);
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  expect(await questionsCard.locator("tbody").innerText()).toBe(
    coordinatorRows,
  );
  await expect(
    page.getByRole("button", { name: "Upload answer CSV", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Demo perspective").selectOption("Coordinator");
  await page
    .getByRole("button", { name: "Open question 32", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^Mark / })
    .first()
    .click();
  const original = await page.getByTestId("sample-answer").textContent();
  const markingUrl = page.url();
  await expect(
    page.getByRole("button", { name: "Confirm category & mark", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Review AI correction",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run original tests", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "Option 2: 5 / 6", exact: true })
    .check();
  await page
    .getByLabel("Marker comment (optional)")
    .fill("Coordinator confirmation");
  await page
    .getByRole("button", { name: "Confirm and next response", exact: true })
    .click();
  await expect(page).not.toHaveURL(markingUrl);
  await page.goto(markingUrl);
  await page.reload();
  await expect(
    page.getByText("Saved mark: 5 / 6", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/coordinator-marking.png",
    mask: [page.getByTestId("sample-answer")],
    maskColor: "#e5eaf0",
    fullPage: true,
  });
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await expect(
    page.getByText("Saved mark: 5 / 6", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Marker comment (optional)")).toHaveValue(
    "Coordinator confirmation",
  );
  await page
    .getByRole("radio", { name: "Option 1: 6 / 6", exact: true })
    .check();
  await page.getByLabel("Marker comment (optional)").fill("Tutor confirmation");
  await page
    .getByRole("button", { name: "Confirm and next response", exact: true })
    .click();
  expect(page.url()).not.toBe(markingUrl);
  await page.getByLabel("Demo perspective").selectOption("Coordinator");
  await page.goto(markingUrl);
  await page.reload();
  await expect(
    page.getByText("Saved mark: 6 / 6", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Marker comment (optional)")).toHaveValue(
    "Tutor confirmation",
  );
  await expect(page.getByTestId("sample-answer")).toHaveText(original!);
  await page.goto("/#/exam/final");
  await expect(page.getByText("1 / 132", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Rubric options by question", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await expect(page.getByText("1 / 132", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Rubric options by question", { exact: true }),
  ).toHaveCount(0);
});

test("coordinator layout fits a narrow screen without page mapping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByText("Rubric pages by question", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/sample-mobile.png",
    fullPage: false,
  });
});
