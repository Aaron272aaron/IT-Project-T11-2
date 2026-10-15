# Local accounts

## First setup

Start the app with `npm run dev` in `frontend/`. Click **Sign up**, enter your name, email, username and a password containing 12–128 characters. The first account becomes the coordinator. No preset real-account password is shipped.

Further accounts require a single-use invitation tied to their email. A signed-in coordinator creates one under **Workspace members → Invite an account**, chooses Tutor or Coordinator, and shares the code. The recipient enters it on Sign up. Invitations expire after 48 hours. This app does not send email.

## Login and logout

Log in using email or username and password. Identity and role are checked by the Python API, not by browser flags. Account sessions restore after refresh/reopening while the cookie is valid. They expire after eight hours or 30 minutes of inactivity.

**Log out** revokes the session in the local database, expires its cookie and removes signed-in UI access. Other account tabs are signed out too. Saved exams and confirmed marks remain intact. If the server cannot complete logout, an error is shown and the user can retry; the UI does not claim that the session was revoked.

The demo has its own browser-session marker and storage. **Demo perspective** appears only in demo mode and never grants real account permissions. The local demo can use CSV/rubric imports, answer grouping, AI code fixes and Docker test runs without creating an account. Demo API access is enabled by default and requires the explicit demo request header plus the same local-origin checks as account requests. Real account lists, invitations, recovery codes and password changes still require a verified account. Set `ALLOW_DEMO_API=0` to disable demo backend access.

## Running a demo

From `frontend/`, run `npm run dev`, then choose **Explore demo workspace** or log in with `demo` / `demo1234`. The demo starts as Coordinator; use **Demo perspective** to demonstrate Tutor screens. Once the signed-in workspace loads, a background queue prepares corrections for every nonblank Coding/Function response in all loaded exams and workspaces. The overall progress bar shows checked responses out of the total and a completion percentage. You can pause/resume preparation and continue marking while it runs. Opening a response uses its prepared correction, or prioritizes it next if it is still queued. Results remain in memory for the current session and are cleared on logout or refresh. New or changed responses are queued automatically; unchanged answers are not reprocessed. If the model is unavailable, preparation waits and resumes automatically when setup finishes. **Review AI correction** opens the comparison, and **Run recommendation tests** checks the correction separately from **Run original tests**. Original answers are read-only; only human marking actions change marks.

AI fixing requires the cached model and Python environment described in [local AI setup](../ai_tools/code_repair/README.md). Tests require Docker and a configured question suite described in [runner setup](../auto_marking/test_runner/README.md). The standard launcher starts these services when available; missing setup produces an actionable error.

## Existing saved exams

The signed-in coordinator can review and copy earlier browser-saved exams into the account workspace. Copies retain original answers, documents, confirmed marks and groups. Existing account exams are not overwritten. The earlier originals are retained in the separate demo storage.

Real account exams use a browser-storage namespace tied to the local account database’s workspace ID. Registered accounts using the same browser/origin see that workspace after logging in; separate browsers do not synchronize exam data yet. Account identity and roles persist in SQLite on this device. The PostgreSQL exam database is a separate integration.

## Password changes and recovery

- Signed-in users can change their password in **User settings** by entering the current password and confirming the new one. Every session for that account is revoked.
- A coordinator can create a one-time password-reset code under **Workspace members → Password recovery**. The user enters it under **Forgot password**. Reset codes expire after one hour and can be used once.
- If the device owner is locked out of the coordinator account, run from the project root:

```bash
python3 -m backend.scripts.manage_accounts reset
```

The tool asks for the account email and new password without echoing the password. It revokes every session for that account. Use the same `AUTH_DB_PATH` as the app if a custom account database was configured.

## Implementation

`backend/security/accounts.py` owns account, session, invitation and recovery-code storage. `backend/api/auth.py` implements the endpoints and authorization. `frontend/src/auth/AuthProvider.tsx` restores/verifies sessions and coordinates logout; `frontend/src/api/auth.ts` supplies request protection to the other API clients.

Passwords use salted PBKDF2-HMAC-SHA256 with 600,000 iterations. Only hashes of random session and access-code tokens are stored. Session cookies are HttpOnly and SameSite=Strict. Mutation requests require the application header and, for signed-in actions, a session-bound CSRF token. Non-local backend Host headers are rejected. Browser origins must be local or match the explicitly configured `APP_PUBLIC_ORIGIN`. Login attempts are rate-limited. Account files have private permissions and are ignored by Git.

These choices follow the [OWASP password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) and [session-management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). The app binds to loopback. Temporary sharing through an HTTPS tunnel requires the explicit origin and Secure-cookie settings below. Production hosting additionally needs a production web server and deployment configuration.

## Settings

| Setting | Purpose |
| --- | --- |
| `AUTH_DB_PATH` | Optional account database path. Default: `backend/data/private/accounts.sqlite3`. |
| `AUTH_DB_PATH=:temporary:` | Disposable account storage for browser tests; removed when the API exits. |
| `ALLOW_DEMO_API=0` | Disable demo backend access and require real accounts for app features. Default: demo access enabled (`1`). |
| `AUTH_COOKIE_SECURE=1` | Adds the cookie’s Secure flag for an HTTPS environment. |
| `APP_PUBLIC_ORIGIN=https://…` | Allow this exact HTTPS browser origin through the local frontend proxy. Other remote origins remain blocked. |

## Temporary sharing with Cloudflare Tunnel

This shares the laptop's app for group testing. Account login works remotely; exams and marks still remain in each browser and do not synchronize. The frontend and backend stay bound to loopback. The frontend proxy continues rewriting the backend Host header to its local address.

1. Install the tunnel tool on macOS: `brew install cloudflared`.
2. Start the app normally from `frontend/` with `npm run dev`. Open the printed local URL and create your coordinator account if needed. Stop the app with Ctrl+C before proceeding.
3. In a separate terminal, run:

   ```bash
   cloudflared tunnel --url http://127.0.0.1:5173
   ```

   Keep this terminal open and copy the generated HTTPS `trycloudflare.com` URL. It can be created before the app is running; requests fail until the next step starts the app.

4. In the app terminal, from `frontend/`, replace the example URL with that exact URL (without a trailing slash):

   ```bash
   export APP_PUBLIC_ORIGIN="https://your-address.trycloudflare.com"
   __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="${APP_PUBLIC_ORIGIN#https://}" \
     ALLOW_DEMO_API=0 AUTH_COOKIE_SECURE=1 caffeinate -i npm run dev
   ```

   This allows one frontend hostname and one HTTPS browser origin, disables unauthenticated demo API calls, and marks session cookies Secure. Use the HTTPS tunnel URL to sign in while these settings are active.

5. Sign in through the tunnel URL. Under **Workspace members**, create invitations for the group's email addresses. Share the URL and each member's invitation code; they register their own accounts.

Keep the laptop lid open and both terminals running. Ctrl+C in the tunnel terminal immediately ends remote access. A new Quick Tunnel generates a new URL: restart the app with that URL, and remember that browser-saved exams belong to the old origin. Anyone who obtains the link can reach the login page; authenticated roles still control API access. The tunnel also exposes the frontend development server, so use it for temporary group testing. For longer-term hosting, serve a production build behind an access-controlled tunnel instead.

Cloudflare's [Quick Tunnel instructions](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) and [downloads](https://developers.cloudflare.com/tunnel/downloads/) describe installation and tunnel behavior.

To return to ordinary local use, stop the app, run `unset APP_PUBLIC_ORIGIN`, then start `npm run dev` normally.
