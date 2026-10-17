import { test, expect } from "@playwright/test";
import { canvasExampleCsv } from "../src/models/canvasCsv";
test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => {
      throw new Error("Unexpected backend request: " + route.request().url());
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await page.goto("/#/exam/final");
  await expect(
    page.getByRole("heading", { name: "Sample exam", exact: true }),
  ).toBeVisible();
});
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
  const markingUrl = page.url();
  await page
    .getByRole("button", { name: "Confirm and next response", exact: true })
    .click();
  await expect(page).not.toHaveURL(markingUrl);
  await page.goto(markingUrl);
  await page.reload();
  await expect(page.getByText(/Saved mark: 1 \/ /)).toBeVisible();
  await page.locator(".mark-decision").screenshot({
    path: "test-results/non-grouped-mark-decision.png",
  });
  await page
    .getByRole("button", { name: "Back to question", exact: true })
    .click();
  await page.getByRole("button", { name: "Back to exam", exact: true }).click();
  await expect(page).toHaveURL(examUrl);
});

test("sample tests and rubric draft work without a backend", async ({
  page,
}) => {
  await page.getByText("Rubric options by question", { exact: true }).click();
  await page
    .getByText("Automatically create rubric from document", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Read saved rubric document", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply imported draft", exact: true }),
  ).toBeVisible();
  await page.goto("/#/exam/final/question/3081168/mark/1674263");
  await page
    .getByRole("button", { name: "Run original tests", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "Original code test cases" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("sample-answer")).toBeVisible();
});

test("coordinator generates a demo recovery code without account services", async ({
  page,
}) => {
  await page.goto("/#/members");
  await expect(page.getByText("Preview only", { exact: true })).toBeVisible();
  const create = page.getByRole("button", {
    name: "Create reset code",
    exact: true,
  });
  await expect(create).toBeDisabled();
  await page.getByLabel("Account to recover").selectOption({ index: 1 });
  await create.click();
  const code = page.getByLabel("One-time access code");
  await expect(code).toHaveValue(/^DEMO-[A-F0-9]{8}$/);
  const first = await code.inputValue();
  await create.click();
  await expect(code).not.toHaveValue(first);
  await page.getByLabel("Account to recover").selectOption({ index: 2 });
  await expect(code).toHaveCount(0);
});

test("example files create a new exam and upload without selecting local files", async ({
  page,
}) => {
  await page.goto("/#/create-exam");
  await page.getByLabel("Exam name *").fill("Example workflow");
  await page
    .locator(".rubric-picker")
    .getByRole("button", { name: "Use example data", exact: true })
    .click();
  await expect(page.locator(".rubric-picker")).toContainText("Selected:");
  await page
    .locator("fieldset")
    .getByRole("button", { name: "Use example data", exact: true })
    .click();
  await expect(
    page.getByText("4 students · 37 questions selected", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create exam", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Example workflow", exact: true }),
  ).toBeVisible();
  const url = page.url();
  await expect(
    page.getByRole("button", { name: "Open question 37", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Download rubric", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Upload answer CSV", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use example data", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Original answer preview", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save answers to exam", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Replace answers", exact: true })
    .click();
  await expect(page).toHaveURL(url);
  await expect(
    page.getByText("example-answers.csv", { exact: true }),
  ).toBeVisible();
});

test('example rubric populates editable options immediately and preserves saved edits', async ({page}) => {
  await page.goto('/#/create-exam');
  await page.getByLabel('Exam name *').fill('Automatic rubric example');
  await page.locator('fieldset').getByRole('button',{name:'Use example data',exact:true}).click();
  await expect(page.getByText('4 students · 37 questions selected',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Create exam',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Automatic rubric example',exact:true})).toBeVisible();
  await page.locator('.rubric-picker').getByRole('button',{name:'Use example data',exact:true}).click();
  const description = page.getByLabel('Option 1 description',{exact:true});
  await expect(description).toBeVisible();
  await expect(description).not.toHaveValue('');
  await page.getByRole('button',{name:'Save rubric',exact:true}).click();
  await expect(page.locator('.saved-attachment')).toBeVisible();
  await description.fill('Coordinator edited example rubric');
  await page.getByRole('button',{name:'Save rubric options',exact:true}).click();
  await page.getByRole('button',{name:'Confirm rubric changes',exact:true}).click();
  await expect(page.getByText('Rubric options saved.', {exact:true})).toBeVisible();
  await page.reload();
  await page.getByText('Rubric options by question',{exact:true}).click();
  await expect(description).toHaveValue('Coordinator edited example rubric');
});

test('Tutor role blocks coordinator routes', async ({page}) => {
 await page.getByLabel('Demo perspective').selectOption('Tutor');
 await expect(page.getByRole('link',{name:'Workspace members',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Upload answer CSV',exact:true})).toHaveCount(0);
 await expect(page.getByText('Question classifications',{exact:true})).toHaveCount(0);
 for (const route of ['/create-exam','/members','/workspace-settings','/exam/final/answers/upload']) {
  await page.goto('/#'+route);
  await expect(page.getByRole('heading',{name:'Coordinator view required'})).toBeVisible();
 }
});

test('Tutor tests preserve answers and confirmed marks persist with comments', async ({page}) => {
 await page.getByLabel('Demo perspective').selectOption('Tutor');
 const url='/#/exam/final/question/3081168/mark/1674263';
 await page.goto(url);
 const original=await page.getByTestId('sample-answer').innerText();
 await page.getByRole('button',{name:'Run original tests',exact:true}).click();
 await expect(page.getByRole('table',{name:'Original code test cases'})).toBeVisible();
 await expect(page.getByTestId('sample-answer')).toHaveText(original);
 await expect(page.getByText(/Saved mark:/)).toHaveCount(0);
 await page.getByRole('radio').first().check();
 await page.getByLabel('Marker comment (optional)',{exact:true}).fill('Tutor checked the assigned rubric.');
 await page.getByRole('button',{name:'Confirm and next response',exact:true}).click();
 await expect(page.getByText('Final mark saved for this response.',{exact:true})).toBeVisible();
 await page.goto(url);
 await page.reload();
 await expect(page.getByText(/Saved mark:/)).toBeVisible();
 await expect(page.getByLabel('Marker comment (optional)',{exact:true})).toHaveValue('Tutor checked the assigned rubric.');
 await expect(page.getByTestId('sample-answer')).toHaveText(original);
 await page.goto('/#/exam/final/question/3081173/mark/1674263');
 await expect(page.getByLabel('Marker comment (optional)',{exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Confirm and next response',exact:true})).toHaveCount(0);
});

test('Tutor confirms a group mark after reviewing the confirmation', async ({page}) => {
 await page.getByLabel('Demo perspective').selectOption('Tutor');
 await page.goto('/#/exam/final/question/3081159');
 await page.getByRole('button',{name:/Group \d+: \d+ students/}).first().click();
 await page.getByRole('radio').first().check();
 await page.getByLabel('Group marker comment (optional)').fill('Reviewed all group responses.');
 await page.getByRole('button',{name:'Confirm group category & mark',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Confirm group mark'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Apply group mark',exact:true}).click();
 await expect(page.getByText(/Group mark saved for/)).toBeVisible();
});
