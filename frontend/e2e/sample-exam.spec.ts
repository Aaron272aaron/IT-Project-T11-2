import { test, expect } from "@playwright/test";

// Track and reject every API call: all sample workflows must remain frontend-only.
const apiRequests = new WeakMap<object, string[]>();

test.afterEach(async ({ page }) => {
  expect(apiRequests.get(page) ?? []).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  const requests: string[] = [];
  apiRequests.set(page, requests);
  await page.route("**/api/**", async (route) => {
    requests.push(route.request().url());
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
    .getByRole("button", { name: "Confirm category & mark", exact: true })
    .click();
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
