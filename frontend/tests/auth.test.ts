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
it("keeps demo calls explicitly labelled and clears account CSRF state", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  setApiSession(session);
  setApiSession(null, true);
  await apiFetch("/api/answer-groups", { method: "POST" });
  const headers = fetch.mock.calls[0][1].headers;
  expect(headers.get("X-Automarktic-Demo")).toBe("1");
  expect(headers.has("X-CSRF-Token")).toBe(false);
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
