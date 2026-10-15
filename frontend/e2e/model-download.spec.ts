import { test, expect } from "@playwright/test";

test("model setup shows byte progress, pause/resume, failures and ready without changing marks", async ({
  page,
}) => {
  // Synthetic transfer states test the actual interface without restoring model weights.
  let state = {
    status: "missing",
    downloadedBytes: 0,
    totalBytes: 0,
    percent: 0,
    filename: "",
    message: "Download the model to enable local AI fixes.",
    installed: false,
    modelId: "local-test-model",
  };
  await page.route("**/api/ai/model**", async (route) => {
    const action = new URL(route.request().url()).pathname.split("/").pop();
    if (action === "download")
      state = {
        ...state,
        status: "downloading",
        downloadedBytes: 1_500_000_000,
        totalBytes: 3_000_000_000,
        percent: 50,
        filename: "model.safetensors",
        message: "Downloading the local AI model…",
      };
    if (action === "cancel")
      state = {
        ...state,
        status: "cancelled",
        message: "Download paused. Choose Resume download to continue.",
      };
    await route.fulfill({
      status: action === "model" ? 200 : 202,
      json: state,
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByLabel("Full name").fill("Setup Example");
  await page.getByLabel("Username", { exact: true }).fill("setupexample");
  await page.getByLabel("Email address").fill("setup@example.edu");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic password 123!");
  await page.getByLabel("Confirm password").fill("Synthetic password 123!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Download AI model", exact: true }),
  ).toBeVisible();
  await page.goto("/#/user-settings");
  await page
    .getByRole("button", { name: "Download AI model", exact: true })
    .click();
  const progress = page.getByRole("progressbar", {
    name: "AI model download progress",
  });
  await expect(progress).toHaveAttribute("value", "50");
  await expect(
    page.getByText("1.50 GB / 3.00 GB", { exact: true }),
  ).toBeVisible();
  await page
    .locator(".model-setup")
    .screenshot({ path: "setup-test-results/model-download-preview.png" });
  await page
    .getByRole("button", { name: "Pause download", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume download", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume download", exact: true })
    .click();
  await expect(progress).toHaveAttribute("value", "50");
  state = {
    ...state,
    status: "loading",
    percent: 100,
    downloadedBytes: 3_000_000_000,
    message: "Download complete. Loading the model into memory…",
  };
  await page.reload();
  await expect(page.getByText("Loading model…", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pause download", exact: true }),
  ).toBeDisabled();
  state = {
    ...state,
    status: "error",
    message: "Connection interrupted. Retry the download.",
  };
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry model setup", exact: true }),
  ).toBeVisible();
  state = {
    ...state,
    status: "ready",
    installed: true,
    message: "Local AI is ready. You can generate fixes.",
  };
  await page.reload();
  await expect(
    page.getByText("Local AI is ready. You can generate fixes.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download AI model", exact: true }),
  ).toHaveCount(0);
});

test("demo account can open setup, download and resume the model", async ({
  page,
}) => {
  let state = {
    status: "missing",
    downloadedBytes: 0,
    totalBytes: 0,
    percent: 0,
    filename: "",
    message: "Download the model to enable local AI fixes.",
    installed: false,
    modelId: "local-test-model",
  };
  const actions: string[] = [];
  await page.route("**/api/ai/model**", async (route) => {
    const action = new URL(route.request().url()).pathname.split("/").pop()!;
    expect(route.request().headers()["x-automarktic-demo"]).toBe("1");
    if (action !== "model") {
      expect(route.request().headers()["x-app-request"]).toBe("AutoMarktic");
      actions.push(action);
    }
    if (action === "download")
      state = {
        ...state,
        status: "downloading",
        downloadedBytes: 750_000_000,
        totalBytes: 3_000_000_000,
        percent: 25,
        filename: "model.safetensors",
        message: "Downloading the local AI model…",
      };
    if (action === "cancel")
      state = {
        ...state,
        status: "cancelled",
        message: "Download paused. Choose Resume download to continue.",
      };
    await route.fulfill({
      status: action === "model" ? 200 : 202,
      json: state,
    });
  });
  await page.goto("/");
  await page.getByLabel("Email or Username").fill("demo");
  await page.getByLabel("Password", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download AI model", exact: true }),
  ).toBeVisible();
  await page.goto("/#/user-settings");
  await page
    .getByRole("button", { name: "Download AI model", exact: true })
    .click();
  await expect(
    page.getByRole("progressbar", { name: "AI model download progress" }),
  ).toHaveAttribute("value", "25");
  await expect(
    page.getByText("750.0 MB / 3.00 GB", { exact: true }),
  ).toBeVisible();
  await page
    .locator(".model-setup")
    .screenshot({ path: "setup-test-results/demo-model-download.png" });
  await page
    .getByRole("button", { name: "Pause download", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Resume download", exact: true })
    .click();
  await expect(
    page.getByRole("progressbar", { name: "AI model download progress" }),
  ).toHaveAttribute("value", "25");
  expect(actions).toEqual(["download", "cancel", "download"]);
});
