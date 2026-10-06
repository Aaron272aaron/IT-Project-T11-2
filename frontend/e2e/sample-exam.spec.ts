import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
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

test("replaces the old Final exam with the supplied sample and a compact mapping editor", async ({
  page,
}) => {
  await expect(
    page.getByRole("button", { name: /Open question \d+$/ }),
  ).toHaveCount(37);
  await expect(
    page.getByText("37 / 37 assigned · Expand to edit", { exact: false }),
  ).toBeVisible();
  const mapping = page.locator(".rubric-assignments > details");
  await expect(mapping).not.toHaveAttribute("open", "");
  expect((await mapping.boundingBox())!.height).toBeLessThan(100);
  await page.getByText("Rubric pages by question", { exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Assign pages sequentially",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await page.locator(".mapping-table").boundingBox())!.height,
  ).toBeLessThanOrEqual(460);
  await page.getByText("Rubric pages by question", { exact: true }).click();
  await page.screenshot({
    path: "test-results/sample-exam-collapsed.png",
    fullPage: false,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sample exam", exact: true }),
  ).toBeVisible();
});

test("sequential mapping is a draft, protects overflow, and persists only on save", async ({
  page,
}) => {
  await page.getByText("Rubric pages by question", { exact: true }).click();
  const first = page.locator(
    'input[aria-label^="CSV question 1 ·"][aria-label$=" start page"]',
  );
  await expect(first).toHaveValue("7");
  await page
    .getByRole("button", { name: "Assign pages sequentially", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("rubric has 24 pages");
  await expect(first).toHaveValue("7");
  await page.getByLabel("To question", { exact: true }).fill("3");
  await page.getByLabel("Starting page", { exact: true }).fill("10");
  await page
    .getByRole("button", { name: "Assign pages sequentially", exact: true })
    .click();
  await expect(first).toHaveValue("10");
  await page.reload();
  await page.getByText("Rubric pages by question", { exact: true }).click();
  await expect(first).toHaveValue("7");
  await page.getByLabel("To question", { exact: true }).fill("3");
  await page.getByLabel("Starting page", { exact: true }).fill("10");
  await page
    .getByRole("button", { name: "Assign pages sequentially", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save page assignments", exact: true })
    .click();
  await page.reload();
  await page.getByText("Rubric pages by question", { exact: true }).click();
  await expect(first).toHaveValue("10");
  await expect(
    page.locator(
      'input[aria-label^="CSV question 3 ·"][aria-label$=" start page"]',
    ),
  ).toHaveValue("12");
  await expect(
    page.locator(
      'input[aria-label^="CSV question 4 ·"][aria-label$=" start page"]',
    ),
  ).toHaveValue("7");
});

test("tutor marks a real response using supplied categories and sees the matching rubric page", async ({
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
  await page.getByRole("button", { name: "View rubric", exact: true }).click();
  await expect(page.getByLabel("Rubric page", { exact: true })).toHaveValue(
    "16",
  );
  await expect(page.getByRole("dialog").locator("canvas")).toHaveAttribute(
    "data-rendered-page",
    "16",
  );
  await page.getByRole("button", { name: "Close rubric" }).click();
  await page
    .getByLabel("Rubric category", { exact: true })
    .selectOption("category-2");
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
  await page.getByRole("button", { name: "View rubric", exact: true }).click();
  await expect(page.getByRole("dialog").locator("canvas")).toHaveAttribute(
    "data-rendered-page",
    "16",
  );
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

test("coordinator layout fits a narrow screen with mappings collapsed or expanded", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByText("Rubric pages by question", { exact: true }).click();
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
