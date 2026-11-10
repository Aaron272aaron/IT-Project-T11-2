import { test, expect, type Page } from "@playwright/test";

const codes = [1, 2, 3].map(
  (number) => `def student_${number}()\n    return ${number}`,
);
const repaired = (code: string) => ({
  status: "repaired",
  originalCode: code,
  suggestedCode: code.replace(")\n", "):\n"),
  syntaxError: { message: "expected ':'", line: 1 },
  diff: [],
  modelId: "mock-model",
  message: "Review the prepared syntax correction.",
});
const modelStatus = (ready: boolean) => ({
  status: ready ? "ready" : "missing",
  downloadedBytes: 0,
  totalBytes: 0,
  percent: 0,
  filename: "",
  message: ready ? "Local AI is ready." : "Download the model first.",
  installed: ready,
  modelId: "mock-model",
});

async function fixture(page: Page) {
  await page.route("**/demo/sample-exam.json", async (route) => {
    const sample = await (await route.fetch()).json();
    sample.answers.preview.students = sample.answers.preview.students.slice(
      0,
      4,
    );
    sample.answers.preview.students.forEach(
      (
        student: {
          id: string;
          answers: { questionId: string; original: string }[];
        },
        index: number,
      ) => {
        student.id = `Test-${index + 1}`;
        for (const answer of student.answers) {
          if (["3081194", "3081195", "3081196"].includes(answer.questionId))
            answer.original =
              answer.questionId === "3081194" ? (codes[index] ?? "") : "";
        }
      },
    );
    await route.fulfill({ json: sample });
  });
}
async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await expect(page.getByText("Sample exam", { exact: true })).toBeVisible();
}
const progress = (page: Page) =>
  page.getByRole("progressbar", {
    name: "All student AI corrections progress",
  });

test("startup prepares every student's code from the dashboard and reuses the whole batch", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/ai/model", (route) =>
    route.fulfill({ json: modelStatus(true) }),
  );
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests: string[] = [];
  let active = 0,
    maximum = 0;
  await page.route("**/api/ai/suggest-fix", async (route) => {
    const { code } = route.request().postDataJSON();
    requests.push(code);
    active++;
    maximum = Math.max(maximum, active);
    if (requests.length === 2) await pending;
    await route.fulfill({ json: repaired(code) });
    active--;
  });
  await login(page);
  const before = await page.evaluate(() =>
    sessionStorage.getItem("automarktic-exams-v1"),
  );
  await expect(progress(page)).toHaveAttribute("max", "3");
  await expect(progress(page)).toHaveAttribute("value", "1");
  await expect(
    page.getByText("1 / 3 responses checked", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await page.locator(".ai-preparation").screenshot({
    path: "preparation-test-results/all-student-ai-progress.png",
  });
  release();
  await expect(progress(page)).toHaveAttribute("value", "3");
  await expect(
    page.getByText("AI preparation complete.", { exact: true }),
  ).toBeVisible();
  expect(requests).toEqual(codes);
  expect(maximum).toBe(1);
  for (let index = 0; index < codes.length; index++) {
    await page.goto(`/#/exam/final/question/3081194/mark/Test-${index + 1}`);
    await expect(page.getByTestId("sample-answer")).toHaveText(codes[index]);
    await expect(page.getByTestId("ai-preview")).toHaveText(
      codes[index].replace(")\n", "):\n"),
    );
  }
  expect(requests).toHaveLength(3);
  expect(
    await page.evaluate(() => sessionStorage.getItem("automarktic-exams-v1")),
  ).toBe(before);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("pause and resume preserve completed responses and keep the batch independent of navigation", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/ai/model", (route) =>
    route.fulfill({ json: modelStatus(true) }),
  );
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests: string[] = [];
  await page.route("**/api/ai/suggest-fix", async (route) => {
    const { code } = route.request().postDataJSON();
    requests.push(code);
    if (requests.length === 2) await pending;
    await route.fulfill({ json: repaired(code) }).catch(() => {});
  });
  await login(page);
  await expect(progress(page)).toHaveAttribute("value", "1");
  await page
    .getByRole("button", { name: "Pause AI preparation", exact: true })
    .click();
  release();
  await page.goto("/#/exams");
  await expect(
    page.getByText("AI preparation paused.", { exact: true }),
  ).toBeVisible();
  await expect(progress(page)).toHaveAttribute("value", "1");
  expect(requests).toHaveLength(2);
  await page
    .getByRole("button", { name: "Resume AI preparation", exact: true })
    .click();
  await expect(progress(page)).toHaveAttribute("value", "3");
  expect(requests.filter((code) => code === codes[0])).toHaveLength(1);
  expect(requests).toHaveLength(4);
});

test("missing model pauses the batch and setup completion resumes it automatically", async ({
  page,
}) => {
  await fixture(page);
  let ready = false;
  await page.route("**/api/ai/model", (route) =>
    route.fulfill({ json: modelStatus(ready) }),
  );
  const requests: string[] = [];
  await page.route("**/api/ai/suggest-fix", async (route) => {
    const { code } = route.request().postDataJSON();
    requests.push(code);
    await route.fulfill(
      ready
        ? { json: repaired(code) }
        : { status: 503, json: { message: "Download the model first." } },
    );
  });
  await page.clock.install();
  await login(page);
  await expect(
    page.getByText("Waiting for local AI setup.", { exact: true }),
  ).toBeVisible();
  await expect(progress(page)).toHaveAttribute("value", "0");
  expect(requests).toHaveLength(1);
  ready = true;
  await page.clock.fastForward(10_000);
  await expect(progress(page)).toHaveAttribute("value", "3");
  expect(requests).toHaveLength(4);
});

test("logout stops the batch and a new session gets fresh preparation results", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/ai/model", (route) =>
    route.fulfill({ json: modelStatus(true) }),
  );
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/ai/suggest-fix", async (route) => {
    const { code } = route.request().postDataJSON();
    if (++requests === 1) await pending;
    await route.fulfill({ json: repaired(code) }).catch(() => {});
  });
  await login(page);
  await expect.poll(() => requests).toBe(1);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Explore demo workspace" }),
  ).toBeVisible();
  release();
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await expect(progress(page)).toHaveAttribute("value", "3");
  expect(requests).toBe(4);
});
