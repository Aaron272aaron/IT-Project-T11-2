import { test, expect } from "@playwright/test";
import { canvasExampleCsv } from "../src/canvasCsv";
import { readFileSync } from "node:fs";
// The bundled fixture supplies paths and IDs; requests still exercise the real Python API.
const sample = JSON.parse(
  readFileSync(
    new URL("../public/demo/sample-exam.json", import.meta.url),
    "utf8",
  ),
);
const questions = sample.answers.preview.questions.filter(
  (q: { instruction: boolean }) => !q.instruction,
);
const docx = Buffer.from(sample.rubric.dataUrl.split(",")[1], "base64");
const pdf = Buffer.from(sample.rubric.previewPdf.split(",")[1], "base64");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await expect(page.getByText("Sample exam", { exact: true })).toBeVisible();
  await page.goto("/#/exam/final");
  await page.getByText("Rubric options by question", { exact: true }).click();
});

test("edits options, rejects invalid marks and persists added/deleted options", async ({
  page,
}) => {
  await page.getByLabel("Option 1 score", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Save rubric options", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("0 to 2");
  await page.getByLabel("Option 1 score", { exact: true }).fill("1.75");
  await page
    .getByLabel("Option 1 description", { exact: true })
    .fill("Updated complete answer");
  await page.getByRole("button", { name: "Add option", exact: true }).click();
  await page.getByLabel("Option 6 score", { exact: true }).fill("0.25");
  await page
    .getByLabel("Option 6 description", { exact: true })
    .fill("Small attempt");
  await page
    .getByRole("button", { name: "Remove option 5", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save rubric options", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm rubric changes", exact: true })
    .click();
  await page.reload();
  await page.getByText("Rubric options by question", { exact: true }).click();
  await expect(page.getByLabel("Option 1 score", { exact: true })).toHaveValue(
    "1.75",
  );
  await expect(
    page.getByLabel("Option 5 description", { exact: true }),
  ).toHaveValue("Small attempt");
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await expect(page.locator(".rubric-editor")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open question 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^Mark / })
    .first()
    .click();
  await expect(
    page.getByRole("radio", { name: "Option 1: 1.75 / 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Updated complete answer", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Description for option 1", { exact: true }).click();
  await expect(
    page.getByText("Updated complete answer", { exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("radio", { name: "Option 1: 1.75 / 2", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Confirm category & mark", exact: true })
    .click();
  await expect(
    page.getByText("Saved mark: 1.75 / 2", { exact: true }),
  ).toBeVisible();
});

test("score changes update all selected-category marks together and deletion preserves history", async ({
  page,
}) => {
  const qid = questions[0].id;
  for (const student of sample.answers.preview.students.slice(0, 2)) {
    await page.goto(`/#/exam/final/question/${qid}/mark/${student.id}`);
    await page
      .getByRole("radio", { name: "Option 1: 2 / 2", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Confirm category & mark", exact: true })
      .click();
  }
  await page.goto("/#/exam/final");
  await page.getByText("Rubric options by question", { exact: true }).click();
  await page.getByLabel("Option 1 score", { exact: true }).fill("1.5");
  await page
    .getByRole("button", { name: "Save rubric options", exact: true })
    .click();
  await expect(page.locator(".rubric-save-review")).toContainText(
    "2 confirmed marks",
  );
  await page
    .getByLabel("Reason for rubric change")
    .fill("Calibrated after review");
  await page
    .getByRole("button", { name: "Confirm rubric changes", exact: true })
    .click();
  for (const student of sample.answers.preview.students.slice(0, 2)) {
    await page.goto(`/#/exam/final/question/${qid}/mark/${student.id}`);
    await expect(
      page.getByText("Saved mark: 1.5 / 2", { exact: true }),
    ).toBeVisible();
  }
  await page.goto("/#/exam/final");
  await page.getByText("Rubric options by question", { exact: true }).click();
  await page
    .getByRole("button", { name: "Remove option 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save rubric options", exact: true })
    .click();
  await page
    .getByLabel("Reason for rubric change")
    .fill("Retire ambiguous option");
  await page
    .getByRole("button", { name: "Confirm rubric changes", exact: true })
    .click();
  await page.goto(
    `/#/exam/final/question/${qid}/mark/${sample.answers.preview.students[0].id}`,
  );
  await expect(
    page.getByText("Saved mark: 1.5 / 2", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("The rubric has changed since this mark was saved.", {
      exact: false,
    }),
  ).toBeVisible();
});

test("imports the actual DOCX into a reviewable draft without Word conversion", async ({
  page,
}) => {
  await page
    .getByText("Automatically create rubric from document", { exact: true })
    .click();
  await page
    .getByLabel("Import rubric document", { exact: true })
    .setInputFiles({
      name: "standard.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: docx,
    });
  await expect(page.locator(".imported-block")).toHaveCount(21);
  await expect(
    page.getByLabel("Questions for section 1", { exact: true }),
  ).toHaveValue("1, 2, 3, 4, 5, 6, 7, 8, 9");
  await expect(
    page.getByLabel("Questions for section 19", { exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("button", { name: "Apply imported draft", exact: true })
    .click();
  await expect(page.locator(".imported-block")).toHaveCount(0);
  await page.getByLabel("Edit question rubric").selectOption(questions[31].id);
  await expect(page.getByLabel("Option 1 score", { exact: true })).toHaveValue(
    "6",
  );
  await page
    .getByRole("button", { name: "Save rubric options", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm rubric changes", exact: true })
    .click();
  await page.reload();
  await page.getByText("Rubric options by question", { exact: true }).click();
  await page.getByLabel("Edit question rubric").selectOption(questions[31].id);
  await expect(page.getByLabel("Option 1 score", { exact: true })).toHaveValue(
    "6",
  );
});

test("imports the actual text PDF and keeps supplementary sections unassigned", async ({
  page,
}) => {
  await page
    .getByText("Automatically create rubric from document", { exact: true })
    .click();
  await page
    .getByLabel("Import rubric document", { exact: true })
    .setInputFiles({
      name: "standard.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
  await expect(page.locator(".imported-block")).toHaveCount(21, {
    timeout: 20000,
  });
  await expect(
    page.getByLabel("Questions for section 13", { exact: true }),
  ).toHaveValue("32");
  await expect(
    page.getByLabel("Questions for section 19", { exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("button", { name: "Apply imported draft", exact: true })
    .click();
  await expect(page.locator(".imported-block")).toHaveCount(0);
});

test("backend failure leaves manual options and stored marks usable", async ({
  page,
}) => {
  await page.route("**/api/rubric/import", (route) =>
    route.fulfill({ status: 500, body: "" }),
  );
  await page
    .getByText("Automatically create rubric from document", { exact: true })
    .click();
  await page
    .getByLabel("Import rubric document", { exact: true })
    .setInputFiles({
      name: "standard.docx",
      mimeType: "application/octet-stream",
      buffer: docx,
    });
  await expect(page.getByRole("alert")).toContainText(
    "Start or restart python",
  );
  await expect(page.getByLabel("Option 1 score", { exact: true })).toHaveValue(
    "2",
  );
  await page
    .getByLabel("Option 1 description", { exact: true })
    .fill("Still editable");
  await page
    .getByRole("button", { name: "Save rubric options", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm rubric changes", exact: true })
    .click();
  await page.reload();
  await page.getByText("Rubric options by question", { exact: true }).click();
  await expect(
    page.getByLabel("Option 1 description", { exact: true }),
  ).toHaveValue("Still editable");
});

test("rubric editor and expanded tutor options fit a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByLabel("Option 1 description", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/rubric-editor-mobile.png",
    fullPage: false,
  });
  await page.goto(
    `/#/exam/final/question/${questions[31].id}/mark/${sample.answers.preview.students[0].id}`,
  );
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await page.getByRole("button", { name: "Close navigation" }).click();
  await page.locator(".rubric-options").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".rubric-score-option details[open]")).toHaveCount(
    7,
  );
  await page.screenshot({
    path: "test-results/rubric-options-mobile.png",
    fullPage: false,
  });
});

// New exams use the same rubric model and routes, not a hard-coded Sample exam ID.
test("creates a rubric and marks answers in a newly created exam", async ({
  page,
}) => {
  await page.goto("/#/create-exam");
  await page.getByLabel("Exam name *").fill("Custom rubric workflow");
  await page.getByRole("button", { name: "Create exam", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Custom rubric workflow", exact: true }),
  ).toBeVisible();
  const examUrl = page.url();
  await page
    .getByRole("button", { name: "Upload answer CSV", exact: true })
    .click();
  await page.getByLabel("Answer CSV file").setInputFiles({
    name: "answers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(canvasExampleCsv),
  });
  await page
    .getByRole("button", { name: "Validate and preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save answers to exam", exact: true })
    .click();
  await expect(page).toHaveURL(examUrl);
  await page.getByText("Rubric options by question", { exact: true }).click();
  await page.getByRole("button", { name: "Add option", exact: true }).click();
  await page.getByLabel("Option 1 score", { exact: true }).fill("1");
  await page
    .getByLabel("Option 1 description", { exact: true })
    .fill("Meets the requirement");
  await page
    .getByRole("button", { name: "Save rubric options", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm rubric changes", exact: true })
    .click();
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await page
    .getByRole("button", { name: "Open question 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^Mark / })
    .first()
    .click();
  await page.getByRole("radio").first().check();
  await page
    .getByRole("button", { name: "Confirm category & mark", exact: true })
    .click();
  await expect(page.getByText(/Saved mark: 1 \/ /)).toBeVisible();
  await page
    .getByRole("button", { name: "Back to question", exact: true })
    .click();
  await page.getByRole("button", { name: "Back to exam", exact: true }).click();
  await expect(page).toHaveURL(examUrl);
});

test("question selector is separated, duplicate scores are combined, and marking mode is removed", async ({
  page,
}) => {
  const panel = page.getByRole("region", {
    name: "Current question",
    exact: true,
  });
  await expect(panel).toBeVisible();
  await expect(page.getByLabel("Marking mode", { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel("Edit question rubric").locator("option").first(),
  ).toHaveText("Question 1");
  await expect(panel.getByText("Maximum marks", { exact: true })).toBeVisible();
  await expect(panel.getByText("Score options", { exact: true })).toBeVisible();
  await expect(page.locator(".rubric-option-editor")).toHaveCount(5);
  const description = page.getByLabel("Option 2 description", { exact: true });
  await expect(description).toContainText(
    "Value correct and type seems to be correct",
  );
  await expect(description).toContainText(
    "Value correct and major type is correct",
  );
  await page.getByLabel("Edit question rubric").selectOption(questions[31].id);
  await expect(panel.locator("strong")).toHaveText(["6", "7"]);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/rubric-question-selector.png",
    fullPage: false,
  });
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await page
    .getByRole("button", { name: "Open question 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^Mark / })
    .first()
    .click();
  await expect(page.getByRole("radio")).toHaveCount(5);
  await expect(
    page.getByText(/Value correct and type seems to be correct/),
  ).toBeVisible();
  await expect(
    page.getByText(/Value correct and major type is correct/),
  ).toBeVisible();
});

// Wheel scrolling must not move the student's answer, including at the list boundary.
test("mark decision keeps rubric scrolling independent and descriptions initially expanded", async ({
  page,
}) => {
  await page.getByLabel("Demo perspective").selectOption("Tutor");
  await page.goto(
    `/#/exam/final/question/${questions[0].id}/mark/${sample.answers.preview.students[0].id}`,
  );
  await expect(
    page.getByRole("heading", { name: "Mark decision", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No automatic marking or code execution is performed.", {
      exact: false,
    }),
  ).toHaveCount(0);
  await expect(page.locator(".rubric-score-option details[open]")).toHaveCount(
    5,
  );
  const left = page.locator(".marking-answer-column");
  await expect(
    left.getByRole("heading", { name: "Question text", exact: true }),
  ).toBeVisible();
  await expect(
    left.getByRole("heading", {
      name: "Original student response",
      exact: true,
    }),
  ).toBeVisible();
  const leftBox = (await left.boundingBox())!;
  const rightBox = (await page.locator(".mark-decision").boundingBox())!;
  expect(rightBox.x).toBeGreaterThanOrEqual(leftBox.x + leftBox.width);
  expect(rightBox.y).toBe(leftBox.y);
  await expect(
    page.getByText(
      "Check the assigned rubric before confirming a score for the whole answer.",
    ),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Use the document's categories and award the corresponding total.",
    ),
  ).toHaveCount(0);
  await expect(page.locator(".mark-decision .rubric-options")).toHaveCSS(
    "font-size",
    "15px",
  );
  const list = page.getByRole("region", {
    name: "Rubric score options",
    exact: true,
  });
  await list.scrollIntoViewIfNeeded();
  const answer = page.getByTestId("sample-answer");
  const before = await answer.boundingBox();
  const position = await list.boundingBox();
  const pageScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.move(
    position!.x + position!.width / 2,
    position!.y + position!.height / 2,
  );
  await page.mouse.wheel(0, 2000);
  await expect
    .poll(() => list.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await page.mouse.wheel(0, 2000);
  // Wait for wheel processing before checking both scroll containers.
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
  expect((await answer.boundingBox())!.y).toBe(before!.y);
  await page.getByLabel("Description for option 5", { exact: true }).click();
  await page.getByRole("radio").last().check();
  await expect(
    page.locator(".rubric-score-option").last().locator("details"),
  ).not.toHaveAttribute("open");
  await page
    .getByRole("button", { name: "Confirm category & mark", exact: true })
    .click();
  await expect(
    page.getByText("Saved mark: 0 / 2", { exact: true }),
  ).toBeVisible();
  await page.locator(".mark-decision").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/mark-decision-desktop.png" });
});
