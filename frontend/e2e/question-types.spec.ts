import { test, expect } from "@playwright/test";

// These tests block every API: classification and the AI placeholder are frontend-only.
const apiCalls = new WeakMap<object, string[]>();
test.beforeEach(async ({ page }) => {
  const calls: string[] = [];
  apiCalls.set(page, calls);
  await page.route("**/api/**", async (route) => {
    calls.push(route.request().url());
    await route.abort();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await expect(page.getByText("Sample exam", { exact: true })).toBeVisible();
  await page.goto("/#/exam/final");
  await expect(
    page.getByText("Question classifications", { exact: true }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect(apiCalls.get(page)).toEqual([]);
});

test("coordinator classifications follow seven exam parts and unsaved edits are discarded", async ({
  page,
}) => {
  await page.getByText("Question classifications", { exact: true }).click();
  await expect(
    page.getByLabel("Question 1 classification", { exact: true }),
  ).toHaveValue("expression-output");
  await expect(
    page.getByLabel("Question 10 classification", { exact: true }),
  ).toHaveValue("assignment-statement");
  await expect(
    page.getByLabel("Question 14 classification", { exact: true }),
  ).toHaveValue("multiple-choice");
  await expect(
    page.getByLabel("Question 18 classification", { exact: true }),
  ).toHaveValue("code-completion");
  await expect(
    page.getByLabel("Question 23 classification", { exact: true }),
  ).toHaveValue("debugging");
  await expect(
    page.getByLabel("Question 32 classification", { exact: true }),
  ).toHaveValue("coding");
  await expect(
    page.getByLabel("Question 35 classification", { exact: true }),
  ).toHaveValue("short-answer");
  await page
    .getByLabel("Question 1 classification", { exact: true })
    .selectOption("coding");
  await page.reload();
  await page.getByText("Question classifications", { exact: true }).click();
  await expect(
    page.getByLabel("Question 1 classification", { exact: true }),
  ).toHaveValue("expression-output");
});

test("saved classification controls the Tutor-only AI dialog without changing answers or scores", async ({
  page,
}) => {
  const original = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("automarktic-exams-v1")!).comp10001.find(
      (e: { id: string }) => e.id === "final",
    ),
  );
  await page.getByText("Question classifications", { exact: true }).click();
  await page
    .getByLabel("Question 1 classification", { exact: true })
    .selectOption("coding");
  await page
    .getByRole("button", { name: "Save classifications", exact: true })
    .click();
  await page.reload();
  await page.getByText("Question classifications", { exact: true }).click();
  await expect(
    page.getByLabel("Question 1 classification", { exact: true }),
  ).toHaveValue("coding");
  await page
    .getByRole("button", { name: "Open question 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^Mark / })
    .first()
    .click();
  const button = page.getByRole("button", {
    name: "Generate AI-suggested fixes",
    exact: true,
  });
  await expect(button).toHaveCount(0);
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await button.click();
  await expect(
    page.getByRole("dialog", { name: "AI-suggested fixes" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText(
    "waiting for API",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await button.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  const after = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("automarktic-exams-v1")!).comp10001.find(
      (e: { id: string }) => e.id === "final",
    ),
  );
  expect(after.answers).toEqual(original.answers);
  expect(after.marks).toEqual(original.marks);
  expect(after.categories).toEqual(original.categories);
});

test("default coding questions show the placeholder and non-coding questions do not", async ({
  page,
}) => {
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await expect(page.locator(".question-types")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open question 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^Mark / })
    .first()
    .click();
  await expect(
    page.getByRole("button", {
      name: "Generate AI-suggested fixes",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.goto("/#/exam/final");
  await page
    .getByRole("button", { name: "Open question 32", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^Mark / })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Generate AI-suggested fixes", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("waiting for API", { exact: true }),
  ).toBeVisible();
});
