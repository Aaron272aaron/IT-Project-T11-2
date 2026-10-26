import { isDatabaseReviewKey } from "../demo/examStorage";
import { demoRequest, resetDemoData } from "../demo/transport";
export type AccountUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: "Coordinator" | "Tutor";
  workspaceId: string;
};
export type AccountSession = {
  user: AccountUser | null;
  csrfToken: string | null;
  firstAccount?: boolean;
};
let csrfToken: string | null = null;
let demo = false;
let generation = 0;
export function setApiSession(session: AccountSession | null, isDemo = false) {
  if (isDemo && !demo) resetDemoData();
  csrfToken = session?.csrfToken ?? null;
  demo = isDemo;
  generation++;
}
export function isDemoSession() {
  return demo;
}
export async function apiFetch(
  input: RequestInfo | URL,
  options: RequestInit = {},
) {
  const demoPath =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.pathname
        : new URL(input.url, location.href).pathname;
  const realTests = demoPath === "/api/test-runs" || demoPath.startsWith("/api/test-runs/");
  let realCorrection = false;
  if (demoPath === "/api/ai/suggest-fix" && typeof options.body === "string") {
    try { realCorrection = isDatabaseReviewKey(JSON.parse(options.body).reviewKey); } catch { /* Let the normal transport validate invalid input. */ }
  }
  const realAi = demoPath === "/api/ai/reviews" || demoPath.startsWith("/api/ai/model") || realCorrection;
  if (demo && demoPath.startsWith("/api/") && !realTests && !realAi)
    return demoRequest(demoPath, options);
  const headers = new Headers(options.headers);
  headers.set("X-App-Request", "AutoMarktic");
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  if (demo) headers.set("X-Automarktic-Demo", "1");
  const requestedGeneration = generation;
  const response = await fetch(input, {
    ...options,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  const path =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.pathname
        : input.url;
  if (
    response.status === 401 &&
    requestedGeneration === generation &&
    !demo &&
    ![
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/reset-password",
    ].includes(path)
  )
    window.dispatchEvent(new Event("automarktic-session-expired"));
  return response;
}
export async function accountRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(
      `/api/auth/${path}`,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
  } catch {
    throw new Error(
      "Cannot reach account services. Start the app with npm run dev and retry.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.message ?? "The account request could not finish. Retry.",
    );
  return data as T;
}
export function validSession(
  value: AccountSession,
): value is AccountSession & { user: AccountUser; csrfToken: string } {
  return (
    !!value?.user &&
    typeof value.csrfToken === "string" &&
    /^[a-f0-9]{64}$/.test(value.csrfToken) &&
    ["Coordinator", "Tutor"].includes(value.user.role) &&
    typeof value.user.id === "string" &&
    typeof value.user.workspaceId === "string" &&
    typeof value.user.email === "string" &&
    typeof value.user.username === "string" &&
    typeof value.user.name === "string"
  );
}
