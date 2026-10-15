import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
const PASSWORD = "Synthetic password 123!";
const EMAIL = "coordinator@example.edu";
const requestHeaders = { "X-App-Request": "AutoMarktic" };
async function login(page: Page, identifier = EMAIL, password = PASSWORD) {
  await page.goto("/");
  await page.getByLabel("Email or Username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Subject dashboard", exact: true }),
  ).toBeVisible();
}
async function ensureCoordinator(request: APIRequestContext) {
  const status = await (await request.get("/api/auth/status")).json();
  const response = status.bootstrapNeeded
    ? await request.post("/api/auth/register", {
        headers: requestHeaders,
        data: {
          name: "Coordinator Example",
          email: EMAIL,
          username: "coordinator",
          password: PASSWORD,
        },
      })
    : await request.post("/api/auth/login", {
        headers: requestHeaders,
        data: { identifier: EMAIL, password: PASSWORD },
      });
  expect(response.ok()).toBe(true);
  return response.json();
}

async function createTutor(
  request: APIRequestContext,
  email: string,
  username: string,
) {
  const coordinator = await ensureCoordinator(request);
  const invitation = await request.post("/api/auth/invite", {
    headers: { ...requestHeaders, "X-CSRF-Token": coordinator.csrfToken },
    data: { email, role: "Tutor" },
  });
  expect(invitation.ok()).toBe(true);
  const code = (await invitation.json()).code;
  const registration = await request.post("/api/auth/register", {
    headers: requestHeaders,
    data: {
      name: "Synthetic Tutor",
      email,
      username,
      password: PASSWORD,
      inviteCode: code,
    },
  });
  expect(registration.ok()).toBe(true);
}

test("first account setup, real login, session restore and complete logout", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(
    page.getByText("Set up the first coordinator account.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Full name").fill("Coordinator Example");
  await page.getByLabel("Username", { exact: true }).fill("coordinator");
  await page.getByLabel("Email address").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill("Different password 123!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "The passwords do not match.",
  );
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Subject dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Demo perspective")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Subject dashboard", exact: true }),
  ).toBeVisible();
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((cookie) =>
    cookie.name.startsWith("automarktic_session_"),
  );
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe("Strict");
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    sessionCookie!.value,
  );
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toBeVisible();
  const oldCookie = await context.request.get("/api/auth/accounts", {
    headers: { Cookie: `${sessionCookie!.name}=${sessionCookie!.value}` },
  });
  expect(oldCookie.status()).toBe(401);
  await page.goto("/#/members");
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Email or Username").fill(EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Invalid password 123!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Invalid email, username or password",
  );
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Subject dashboard", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "auth-test-results/login.png",
    fullPage: true,
  });
});

test("coordinator invitations create real tutors and permissions cannot be changed in the browser", async ({
  page,
  context,
}) => {
  await ensureCoordinator(context.request);
  await login(page);
  await page.goto("/#/members");
  await page.getByLabel("Invitation email").fill("tutor@example.edu");
  await page.getByLabel("Account role").selectOption("Tutor");
  await page.getByRole("button", { name: "Create invitation" }).click();
  const code = await page.getByLabel("One-time access code").inputValue();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByLabel("Full name").fill("Tutor Example");
  await page.getByLabel("Username", { exact: true }).fill("tutor");
  await page.getByLabel("Email address").fill("tutor@example.edu");
  await page.getByLabel("Invitation code").fill(code);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Subject dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Workspace members", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Demo perspective")).toHaveCount(0);
  await page.goto("/#/members");
  await expect(
    page.getByRole("heading", { name: "Coordinator view required" }),
  ).toBeVisible();
  const session = await (await context.request.get("/api/auth/session")).json();
  const forged = await context.request.post("/api/auth/invite", {
    headers: {
      ...requestHeaders,
      "X-CSRF-Token": session.csrfToken,
      "X-Role": "Coordinator",
    },
    data: { email: "intruder@example.edu", role: "Coordinator" },
  });
  expect(forged.status()).toBe(403);
});

test("password recovery is one-time and the replacement password works", async ({
  page,
  context,
}) => {
  await createTutor(context.request, "recovery@example.edu", "recoverytutor");
  await login(page);
  await page.goto("/#/members");
  await page
    .getByLabel("Account to recover")
    .selectOption("recovery@example.edu");
  await page.getByRole("button", { name: "Create reset code" }).click();
  const code = await page.getByLabel("One-time access code").inputValue();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page.getByLabel("Email address").fill("recovery@example.edu");
  await page.getByLabel("Password-reset code").fill(code);
  await page
    .getByLabel("New password", { exact: true })
    .fill("New synthetic password 456!");
  await page.getByLabel("Confirm password").fill("New synthetic password 456!");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password reset");
  await login(page, "recoverytutor", "New synthetic password 456!");
});

test("logout propagates to other tabs and cannot bypass login with history or stored flags", async ({
  page,
  context,
}) => {
  await ensureCoordinator(context.request);
  await login(page);
  const other = await context.newPage();
  await other.goto("/#/members");
  await expect(
    other.getByRole("heading", { name: "Workspace members", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    other.getByRole("button", { name: "Log in", exact: true }),
  ).toBeVisible();
  await other.evaluate(() => {
    const key = Object.keys(sessionStorage).find((key) =>
      key.startsWith("automarktic-demo-v1:"),
    );
    if (key) {
      const value = JSON.parse(sessionStorage.getItem(key)!);
      value.logged = true;
      value.demoRole = "Coordinator";
      sessionStorage.setItem(key, JSON.stringify(value));
    }
  });
  await other.reload();
  await other.goto("/#/members");
  await expect(
    other.getByRole("button", { name: "Log in", exact: true }),
  ).toBeVisible();
});

test("failed logout stays visible and retry succeeds", async ({
  page,
  context,
}) => {
  await ensureCoordinator(context.request);
  await login(page);
  await page.route("**/api/auth/logout", (route) => route.abort());
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Cannot reach account services",
  );
  await expect(
    page.getByRole("heading", { name: "Subject dashboard", exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/auth/logout");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toBeVisible();
});

test("password changes revoke the session and require the new password", async ({
  page,
  context,
}) => {
  await createTutor(
    context.request,
    "password-change@example.edu",
    "changetutor",
  );
  await login(page, "changetutor");
  await page.goto("/#/user-settings");
  await page.getByLabel("Current password", { exact: true }).fill(PASSWORD);
  await page
    .getByLabel("New account password", { exact: true })
    .fill("Changed synthetic password 789!");
  await page
    .getByLabel("Confirm new account password", { exact: true })
    .fill("Changed synthetic password 789!");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Password changed");
  await login(page, "changetutor", "Changed synthetic password 789!");
});

test("earlier saved exams can be reviewed and copied without losing the originals", async ({
  page,
  context,
}) => {
  await ensureCoordinator(context.request);
  await page.goto("/");
  const exam = {
    id: "saved",
    title: "Earlier saved exam",
    description: "Synthetic",
    sampleVersion: 1,
    questionTypes: { q: "short-answer" },
    categories: { q: [{ id: "full", score: 2, description: "Correct" }] },
    marks: {
      q: {
        s1: { score: 1, comment: "Earlier decision", confirmedAt: "before" },
      },
    },
    answers: {
      name: "synthetic.csv",
      uploadedAt: "before",
      preview: {
        issues: [],
        questions: [
          {
            id: "q",
            text: "What colour?",
            maxMark: 2,
            instruction: false,
            column: 1,
          },
        ],
        students: ["s1", "s2"].map((id) => ({
          id,
          canvasId: id,
          attempt: "1",
          answers: [
            {
              questionId: "q",
              original: "blue sky",
              sourceScore: "0",
              blank: false,
              unicodeReview: false,
            },
          ],
        })),
      },
    },
  };
  await page.evaluate(
    (saved) =>
      localStorage.setItem(
        "automarktic-exams-v1",
        JSON.stringify({ comp10001: [saved] }),
      ),
    exam,
  );
  await login(page);
  await page.getByRole("button", { name: "Review saved exam import" }).click();
  await expect(
    page.getByRole("dialog", { name: "Copy saved exams" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Copy saved exams", exact: true })
    .click();
  await page.goto("/#/exam/saved/question/q");
  await expect(
    page.getByRole("button", { name: "Group 1: 2 students", exact: true }),
  ).toBeVisible();
  const preserved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("automarktic-exams-v1")!).comp10001[0],
  );
  expect(preserved).toEqual(exam);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await login(page);
  await page.goto("/#/exam/saved/question/q/mark/s1");
  await expect(
    page.getByText("Saved mark: 1 / 2", { exact: true }),
  ).toBeVisible();
});
