import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Subject dashboard", exact: true }),
  ).toBeVisible();
});
test("every designed route renders and desktop layout stays within viewport", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const route of [
    "/dashboard",
    "/exams",
    "/create-workspace",
    "/create-exam",
    "/exam/final/answers/upload",
    "/members",
    "/workspace-settings",
    "/user-settings",
    "/exam/final",
    "/exam/final/review",
    "/exam/midterm",
    "/exam/practice",
    "/exam/final/import",
    "/question/1",
    "/question/2",
    "/question/3",
    "/question/4",
    "/question/5",
    "/question/6",
    "/question/1/mark/demo001",
    "/question/3/mark/demo001",
    "/question/5/mark/demo001",
  ]) {
    await page.goto("/#" + route);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
  await page.goto("/#/dashboard");
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.goto("/#/question/5/mark/demo001");
  await page.screenshot({
    path: "test-results/function-review.png",
    fullPage: true,
  });
});
test("workspace creation isolates responses and settings persist on refresh", async ({
  page,
}) => {
  await page.goto("/#/create-workspace");
  await page.getByLabel("Workspace name *").fill("COMP20000 · Semester 2");
  await page.getByLabel("Subject *").fill("Algorithms");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page.getByText("Algorithms · Semester 1, 2026")).toBeVisible();
  await page.goto("/#/question/1");
  await expect(
    page.getByText("Import student answers to begin marking."),
  ).toBeVisible();
  await page.goto("/#/user-settings");
  await page.getByLabel("Display name *").fill("Alex Updated");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.reload();
  await expect(page.getByLabel("Display name *")).toHaveValue("Alex Updated");
});
test("CSV error, review, progress and completion flow", async ({ page }) => {
  await page.goto("/#/exam/final/import");
  await page.getByRole("button", { name: "Try validation errors" }).click();
  await page.getByRole("button", { name: "Validate CSV" }).click();
  await expect(
    page.getByText("Import blocked: fix the issues below"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Upload corrected CSV" }).click();
  await page
    .getByRole("button", { name: "Use sample file", exact: true })
    .click();
  await page.getByRole("button", { name: "Validate CSV" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready to import into Final exam" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import 3 responses" }).click();
  await expect(
    page.getByRole("heading", { name: "Import complete", exact: true }),
  ).toBeVisible();
  await page.goto("/#/question/5/mark/demo241");
  await expect(
    page.getByText("Tests have not been run for this response."),
  ).toBeVisible();
  await expect(page.locator(".code-block").first()).toContainText(
    "    return s.strip().lower()",
  );
});
test("category selection requires confirmation and group marking skips locks", async ({
  page,
}) => {
  await page.goto("/#/question/3/mark/demo001");
  await page
    .getByRole("button", { name: "Confirm category & mark", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Choose a rubric category",
  );
  await page.getByRole("radio", { name: /Fully correct/ }).check();
  await expect(page.locator(".category-total")).toContainText("10 / 10");
  await page.reload();
  await expect(
    page.getByRole("radio", { name: /Fully correct/ }),
  ).not.toBeChecked();
  await page.getByRole("radio", { name: /Partially correct/ }).check();
  await page
    .getByRole("button", { name: "Confirm category & mark", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("radio", { name: /Partially correct/ }),
  ).toBeChecked();
  await page.goto("/#/question/1/mark/demo001");
  await page.getByRole("radio", { name: /Partially correct/ }).check();
  await page.getByRole("button", { name: "Entire group", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm category & mark", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("71");
  await page.getByRole("button", { name: "Apply group mark" }).click();
  await page.goto("/#/question/1/mark/demo002");
  await expect(
    page.getByRole("radio", { name: /Partially correct/ }),
  ).toBeChecked();
  await page.goto("/#/question/1/mark/demo003");
  await expect(
    page.getByRole("heading", { name: "Response unavailable" }),
  ).toBeVisible();
});
test("coordinator previews, cancels and applies category-wide score changes", async ({
  page,
}) => {
  await page.goto("/#/question/1/mark/demo001");
  await page.getByRole("radio", { name: /Partially correct/ }).check();
  await page
    .getByRole("button", { name: "Confirm category & mark", exact: true })
    .click();
  await page.goto("/#/exam/final");
  await page
    .getByRole("button", { name: "Review rubric scores", exact: true })
    .click();
  await page.getByLabel("Partially correct proposed score").fill("3");
  await page
    .getByLabel("Reason for score change *")
    .fill("Accept partial explanation after review");
  await page.getByRole("button", { name: "Review and apply changes" }).click();
  await expect(page.getByRole("dialog")).toContainText("2.5 → 3");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel("Partially correct proposed score")).toHaveValue(
    "2.5",
  );
  await page.getByLabel("Partially correct proposed score").fill("3");
  await page
    .getByLabel("Reason for score change *")
    .fill("Accept partial explanation after review");
  await page.getByRole("button", { name: "Review and apply changes" }).click();
  await page
    .getByRole("button", { name: "Apply category scores", exact: true })
    .click();
  await expect(page.getByLabel("Partially correct proposed score")).toHaveValue(
    "3",
  );
  await expect(page.locator(".change-history")).toContainText(
    "Accept partial explanation",
  );
  await page.screenshot({
    path: "test-results/rubric-review.png",
    fullPage: true,
  });
  await page.goto("/#/question/1/mark/demo001");
  await expect(page.locator(".category-total")).toContainText("3 / 5");
  await expect(
    page.getByText("Score when category was selected:", { exact: false }),
  ).toContainText("2.5");
  await page.goto("/#/exam/final");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export confirmed marks" }).click();
  const download = await downloadPromise;
  const fs = await import("node:fs/promises");
  const csv = await fs.readFile((await download.path())!, "utf8");
  expect(csv).toContain("rubric_category");
  expect(csv).toContain("demo001,1,Partially correct,2.5,3");
});
test("member add, search and remove", async ({ page }) => {
  await page.goto("/#/members");
  await page.getByRole("button", { name: "+ Add member" }).click();
  await page.getByLabel("Full name *").fill("New Tutor");
  await page.getByLabel("Email *").fill("new@example.edu");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add member", exact: true })
    .click();
  await page.getByLabel("Search members").fill("new@example.edu");
  await expect(
    page.getByRole("cell", { name: "New Tutor new@example.edu" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove member", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Remove workspace member?" })
    .getByRole("button", { name: "Remove member", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No members found" }),
  ).toBeVisible();
});
test("mobile navigation and pages do not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/dashboard",
    "/create-workspace",
    "/members",
    "/exam/final/import",
    "/question/1",
    "/question/5/mark/demo001",
    "/exam/final/review",
  ]) {
    await page.goto("/#" + route);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "test-results/mobile-review.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .getByRole("link", { name: "Workspace settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Workspace settings", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-settings.png",
    animations: "disabled",
    fullPage: true,
  });
});
test("login error and password visibility states", async ({ page }) => {
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.getByLabel("Email or Username").fill("wrong");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Invalid email or password",
  );
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByLabel("Email or Username").fill("demo");
  await page.getByLabel("Password", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Subject dashboard", exact: true }),
  ).toBeVisible();
});
