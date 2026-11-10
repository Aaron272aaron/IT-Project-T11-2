import { test, expect } from "@playwright/test";

test("two tutors share an answer read-only until the owner leaves", async ({browser, baseURL}) => {
  test.setTimeout(60000);
  const coordinator = await browser.newContext();
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  const headers = {"X-App-Request": "AutoMarktic"};
  const password = "Synthetic password 123!";
  const registered = await coordinator.request.post(`${baseURL}/api/auth/register`, {headers, data: {name: "Coordinator", username: "lockcoordinator", email: "lockc@example.edu", password}});
  expect(registered.status()).toBe(201);
  const session = await registered.json();
  const secure = {...headers, "X-CSRF-Token": session.csrfToken};
  for (const [context, name] of [[alice, "Alice"], [bob, "Bob"]] as const) {
    const email = `${name.toLowerCase()}@example.edu`;
    const invite = await coordinator.request.post(`${baseURL}/api/auth/invite`, {headers: secure, data: {email, role: "Tutor"}});
    const {code} = await invite.json();
    const response = await context.request.post(`${baseURL}/api/auth/register`, {headers, data: {name, username: name.toLowerCase(), email, password, inviteCode: code}});
    expect(response.status()).toBe(201);
  }
  const exam = {id: "lock-exam", title: "Lock exam", description: "", questionTypes: {q: "short-answer"}, categories: {q: [{id: "correct", score: 2, description: "Correct answer"}]}, answers: {name: "test.csv", uploadedAt: "now", preview: {issues: [], questions: [{id: "q", text: "Question text", maxMark: 2, column: 0, instruction: false}], students: ["s", "s2"].map(id => ({id, canvasId: id, attempt: "1", answers: [{questionId: "q", original: "Original answer", sourceScore: "0", blank: false, unicodeReview: false}]}))}}};
  expect((await coordinator.request.post(`${baseURL}/api/exams`, {headers: secure, data: {revision: 0, registry: {comp10001: [exam]}}})).status()).toBe(200);
  const a = await alice.newPage(), b = await bob.newPage();
  for (const [page, name] of [[a, "alice"], [b, "bob"]] as const) {
    await page.goto(baseURL!);
    await page.getByLabel("Email or Username").fill(name);
    await page.getByLabel("Password", {exact: true}).fill(password);
    await page.getByRole("button", {name: "Log in", exact: true}).click();
    await expect(page.getByRole("heading", {name: "Subject dashboard", exact: true})).toBeVisible();
  }
  const url = `${baseURL}/#/exam/lock-exam/question/q/mark/s`;
  await a.goto(url);
  await expect(a.getByRole("radio").first()).toBeEnabled();
  await b.goto(url);
  await expect(b.getByTestId("sample-answer")).toHaveText("Original answer");
  await expect(b.getByText("Alice is marking this answer.", {exact: false})).toBeVisible();
  await expect(b.getByRole("radio").first()).toBeDisabled();
  await expect(b.getByLabel("Marker comment (optional)", {exact: true})).toBeDisabled();
  await expect(b.getByRole("button", {name: "Confirm and next response", exact: true})).toHaveCount(0);
  await a.getByRole("radio").first().check();
  await a.getByLabel("Marker comment (optional)", {exact: true}).fill("Alice reviewed");
  await a.getByRole("button", {name: "Confirm and next response", exact: true}).click();
  await expect(a).toHaveURL(/mark\/s2$/);
  await expect(b.getByRole("button", {name: "Start marking", exact: true})).toBeVisible({timeout: 15000});
  await b.getByRole("button", {name: "Start marking", exact: true}).click();
  await expect(b.getByRole("radio").first()).toBeEnabled();
  await expect(b.getByLabel("Marker comment (optional)", {exact: true})).toHaveValue("Alice reviewed");
  await expect(b.getByText("Saved mark: 2 / 2", {exact: true})).toBeVisible();
  await b.getByLabel("Marker comment (optional)", {exact: true}).fill("Unsaved Bob draft");
  await b.route("**/api/marking-locks", route => route.abort());
  await expect(b.getByLabel("Marker comment (optional)", {exact: true})).toBeDisabled({timeout: 15000});
  await expect(b.getByLabel("Marker comment (optional)", {exact: true})).toHaveValue("Unsaved Bob draft");
  await expect(b.getByRole("button", {name: "Confirm and next response", exact: true})).toHaveCount(0);
  await alice.close(); await bob.close(); await coordinator.close();
});
