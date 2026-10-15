import { createHash } from "node:crypto";
import { test, expect } from "@playwright/test";

const submitted = "def clean_text(s)\n    return s.strip().lower()";
const fixed = submitted.replace(")\n", "):\n");

test.beforeEach(async ({ page }) => {
  // Start blocked, then let each test resume with its own simulated model reply.
  await page.route("**/api/ai/suggest-fix", (route) =>
    route.fulfill({
      status: 503,
      json: { message: "Synthetic model setup pending." },
    }),
  );
  // Synthetic answers and mocked services keep student data and model downloads out of this test.
  await page.route("**/demo/sample-exam.json", async (route) => {
    const response = await route.fetch();
    const sample = await response.json();
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
            answer.original = "";
        }
      },
    );
    sample.answers.preview.students[0].answers.find(
      (answer: { questionId: string }) => answer.questionId === "3081194",
    ).original = submitted;
    await route.fulfill({ json: sample });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await expect(page.getByText("Sample exam", { exact: true })).toBeVisible();
});

for (const mode of ["demo", "imported"] as const) {
  test(`${mode} reviews and tests original answers without edit or replace controls`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Seed edits from the old interface to check they cannot change displayed or tested answers.
    await page.evaluate(
      ({ mode, submitted }) => {
        if (mode === "demo") {
          const data = JSON.parse(
            sessionStorage.getItem("automarktic-demo-v1")!,
          );
          data.active = "code-review-demo";
          data.workspaces.push({ ...data.workspaces[0], id: data.active });
          data.answers[data.active] = structuredClone(
            data.answers.comp10001,
          ).filter(
            (answer: { id: string; question: number }) =>
              answer.question === 5 &&
              ["demo001", "demo002"].includes(answer.id),
          );
          data.answers[data.active].find(
            (answer: { id: string }) => answer.id === "demo002",
          ).original = "";
          const answer = data.answers[data.active].find(
            (answer: { question: number; id: string }) =>
              answer.question === 5 && answer.id === "demo001",
          );
          answer.reviewCode = {
            original: answer.original,
            code: "old marker edit",
          };
          sessionStorage.setItem("automarktic-demo-v1", JSON.stringify(data));
        } else {
          const registry = JSON.parse(
            sessionStorage.getItem("automarktic-exams-v1")!,
          );
          registry.comp10001.find(
            (exam: { id: string }) => exam.id === "final",
          ).reviewCode = {
            "3081194": {
              "Test-1": { original: submitted, code: "old marker edit" },
            },
          };
          sessionStorage.setItem(
            "automarktic-exams-v1",
            JSON.stringify(registry),
          );
        }
      },
      { mode, submitted },
    );
    await page.reload();
    await page
      .getByLabel("Demo perspective")
      .selectOption(mode === "demo" ? "Coordinator" : "Tutor");
    const requests: { code: string; variant: string }[] = [];
    await page.route("**/api/test-runs", async (route) => {
      const payload = route.request().postDataJSON();
      requests.push(payload);
      await route.fulfill({
        json: {
          ...payload,
          runId: "a".repeat(32),
          codeDigest: createHash("sha256").update(payload.code).digest("hex"),
          status: "completed",
          passed: 1,
          total: 1,
          cases: [
            {
              name: "synthetic_check",
              input: "clean_text(' A ')",
              expected: "a",
              actual: "a",
              outcome: "passed",
              error: "",
              errorKind: null,
              duration: 0.01,
            },
          ],
        },
      });
    });
    let aiRequests = 0;
    await page.route("**/api/ai/suggest-fix", async (route) => {
      aiRequests++;
      expect(route.request().postDataJSON().code).toBe(submitted);
      await route.fulfill({
        json: {
          status: "repaired",
          originalCode: submitted,
          suggestedCode: fixed,
          syntaxError: { message: "expected ':'", line: 1 },
          diff: [],
          message: "Review the suggested syntax fix.",
          modelId: "mock-model",
        },
      });
    });
    await page
      .getByRole("button", { name: "Resume AI preparation", exact: true })
      .click();
    await page.goto(
      mode === "demo"
        ? "/#/question/5/mark/demo001"
        : "/#/exam/final/question/3081194/mark/Test-1",
    );
    const displayed = page.getByTestId(
      mode === "demo" ? "student-answer" : "sample-answer",
    );
    await expect(displayed).toHaveText(submitted);
    await expect(page.getByTestId("ai-preview")).toHaveText(fixed);
    for (const name of [
      "Edit code",
      "Restore original code",
      "Save code changes",
      "Run edited tests",
    ]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
        0,
      );
    }
    await expect(
      page.getByLabel("Edit function code", { exact: true }),
    ).toHaveCount(0);
    const before = await page.evaluate(() => ({
      demo: sessionStorage.getItem("automarktic-demo-v1"),
      exams: sessionStorage.getItem("automarktic-exams-v1"),
    }));
    await page
      .getByRole("button", { name: "Run original tests", exact: true })
      .click();
    await expect(
      page.getByText("Original code: 1 / 1 tests passed", { exact: true }),
    ).toBeVisible();
    expect(requests.at(-1)).toMatchObject({
      code: submitted,
      variant: "original",
    });
    await page
      .getByRole("button", { name: "Review AI correction", exact: true })
      .click();
    await expect(page.getByTestId("ai-original")).toHaveText(submitted);
    await expect(page.getByTestId("ai-suggestion")).toHaveText(fixed);
    await expect(
      page.getByRole("button", { name: "Replace original code", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Run recommendation tests", exact: true })
      .click();
    await expect(
      page.getByText("AI recommendation: 1 / 1 tests passed", { exact: true }),
    ).toBeVisible();
    expect(requests.at(-1)).toMatchObject({
      code: fixed,
      variant: "recommendation",
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await expect(displayed).toHaveText(submitted);
    expect(
      await page.evaluate(() => ({
        demo: sessionStorage.getItem("automarktic-demo-v1"),
        exams: sessionStorage.getItem("automarktic-exams-v1"),
      })),
    ).toEqual(before);
    const markingUrl = page.url();
    await page.goto(
      mode === "demo" ? "/#/question/5" : "/#/exam/final/question/3081194",
    );
    await page.goto(markingUrl);
    await expect(page.getByTestId("ai-preview")).toHaveText(fixed);
    await expect(
      page.getByText("AI preparation complete.", { exact: true }),
    ).toBeVisible();
    expect(aiRequests).toBe(mode === "demo" ? 2 : 1);
    await page.reload();
    await expect(displayed).toHaveText(submitted);
    await expect(page.getByTestId("ai-preview")).toHaveText(fixed);
    await expect(
      page.getByText("AI preparation complete.", { exact: true }),
    ).toBeVisible();
    expect(aiRequests).toBe(mode === "demo" ? 4 : 2);
    if (mode === "imported") {
      await displayed
        .locator("..")
        .screenshot({ path: "test-results/read-only-student-code.png" });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
    }
    expect(errors).toEqual([]);
  });
}
