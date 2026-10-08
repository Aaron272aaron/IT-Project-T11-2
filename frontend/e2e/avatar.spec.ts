import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await page.goto("/#/user-settings");
});

test("demo photo, upload drafts, discard, save and initials persist across account surfaces", async ({
  page,
}) => {
  const preview = page.locator(".avatar-settings img");
  const sidebar = page.locator(".account-link img");
  await expect(preview).toHaveAttribute("src", /demo\/avatar.png$/);
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await page
    .getByLabel("Profile photo", { exact: true })
    .setInputFiles("public/demo/avatar.png");
  await expect(preview).toHaveAttribute("src", /^data:image\/png/);
  await expect(sidebar).toHaveAttribute("src", /demo\/avatar.png$/);
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(preview).toHaveAttribute("src", /demo\/avatar.png$/);
  await page
    .getByLabel("Profile photo", { exact: true })
    .setInputFiles("public/demo/avatar.png");
  await expect(preview).toHaveAttribute("src", /^data:image\/png/);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.reload();
  await expect(sidebar).toHaveAttribute("src", /^data:image\/png/);
  await page.goto("/#/members");
  const me = page
    .getByRole("row")
    .filter({ has: page.getByText("You", { exact: true }) });
  await expect(me.locator("img")).toHaveAttribute("src", /^data:image\/png/);
  await page.goto("/#/user-settings");
  await page.getByRole("button", { name: "Use initials instead" }).click();
  await page.getByLabel("Display name *", { exact: true }).fill("Ada Lovelace");
  await expect(preview).toHaveAttribute("src", /^data:image\/svg\+xml/);
  expect(decodeURIComponent((await preview.getAttribute("src"))!)).toContain(
    ">AL</text>",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.reload();
  await expect(sidebar).toHaveAttribute("src", /^data:image\/svg\+xml/);
  expect(decodeURIComponent((await sidebar.getAttribute("src"))!)).toContain(
    ">AL</text>",
  );
});

test("invalid uploads leave the saved photo intact", async ({ page }) => {
  const input = page.getByLabel("Profile photo", { exact: true });
  for (const file of [
    { name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("bad") },
    { name: "bad.png", mimeType: "image/png", buffer: Buffer.from("bad") },
    {
      name: "large.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    },
  ]) {
    await input.setInputFiles(file);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".avatar-settings img")).toHaveAttribute(
      "src",
      /demo\/avatar.png$/,
    );
  }
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("tutor can set initials on a narrow screen", async ({ page }) => {
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Use initials instead" }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.reload();
  await expect(page.locator(".avatar-settings img")).toHaveAttribute(
    "src",
    /^data:image\/svg\+xml/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".avatar-settings").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/avatar-mobile.png" });
});
