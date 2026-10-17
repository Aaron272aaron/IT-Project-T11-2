import { afterEach, expect, it, vi } from "vitest";
import { apiFetch, setApiSession, validSession } from "../src/api/auth";
const session = {
  user: {
    id: "u",
    name: "Test",
    email: "test@example.edu",
    username: "test",
    role: "Tutor" as const,
    workspaceId: "w",
  },
  csrfToken: "a".repeat(64),
};
afterEach(() => {
  setApiSession(null);
  vi.unstubAllGlobals();
});
it("adds session protection to API requests without exposing cookies", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  setApiSession(session);
  await apiFetch("/api/answer-groups", { method: "POST" });
  const options = fetch.mock.calls[0][1];
  expect(options.headers.get("X-CSRF-Token")).toBe(session.csrfToken);
  expect(options.headers.get("X-App-Request")).toBe("AutoMarktic");
  expect(options.credentials).toBe("same-origin");
  expect(options.headers.has("Cookie")).toBe(false);
});
it("keeps demo requests offline and restores account transport on exit", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  setApiSession(session);
  setApiSession(null, true);
  const response = await apiFetch("/api/answer-groups", {
    method: "POST",
    body: JSON.stringify({
      answers: [{ submission_id: "s1", student_id: "s1", answer: "1" }],
    }),
  });
  expect((await response.json()).group_count).toBe(1);
  expect(fetch).not.toHaveBeenCalled();
  setApiSession(session);
  await apiFetch("/api/answer-groups", { method: "POST" });
  expect(fetch.mock.calls[0][1].headers.get("X-CSRF-Token")).toBe(
    session.csrfToken,
  );
  expect(fetch.mock.calls[0][1].headers.has("X-Automarktic-Demo")).toBe(false);
});

it("rejects missing users, malformed tokens and untrusted roles", () => {
  expect(validSession(session)).toBe(true);
  expect(validSession({ user: null, csrfToken: null })).toBe(false);
  expect(validSession({ ...session, csrfToken: "bad" })).toBe(false);
  expect(
    validSession({
      ...session,
      user: { ...session.user, role: "admin" },
    } as never),
  ).toBe(false);
});
