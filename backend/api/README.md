# Frontend and backend API

Start both services from `frontend/` with `npm run dev`. Open the address printed in the terminal (normally `http://127.0.0.1:5173`). Vite forwards browser requests beginning with `/api` to the Python server on port 8000.

## Files

| Folder / file | Responsibility |
| --- | --- |
| `backend/api/handler.py` | Dispatch routes and return JSON responses |
| `backend/api/canvas.py` | Accept and validate CSV uploads |
| `backend/api/rubric.py` | Import rubric options and convert Word documents |
| `backend/api/demo.py` | Read the prepared local sample exam |
| `backend/api/ai.py` | Validate local AI syntax-repair requests |
| `backend/api/runner.py` | Start and retrieve automated test jobs |
| `auto_marking/jobs.py` | Schedule bounded isolated Docker runs and drain active jobs on shutdown |
| `auto_marking/docker_lifecycle.py` | Start local macOS Docker Desktop and stop only the session the app owns |
| `backend/services/csv_parser.py` | Original Canvas CSV parser, renamed from `csv import.py` |
| `backend/tests/` | HTTP and service checks |
| `backend/scripts/` | Sample preparation |
| `backend/data/` | Sample configuration and generated records |
| `backend/api/server.py` | Start the local Python HTTP server |
| `frontend/src/api/canvas.ts` | Request and validate CSV previews |
| `frontend/src/api/rubric.ts` | Request rubric drafts from DOCX or extracted PDF text |
| `frontend/src/api/rubricPreview.ts` | Request a PDF preview of an uploaded DOCX |
| `frontend/src/api/testRuns.ts` | Request tests and validate the exact code associated with results |
| `frontend/src/services/rubricDocument.ts` | Local PDF rendering and document preparation |
| `frontend/scripts/dev.mjs` | Start both services, check readiness, and stop them together |

## Endpoints

| Method | URL | Body | Result |
| --- | --- | --- | --- |
| POST | `/api/ai/suggest-fix` | JSON `{ "code": "…", "comment": "…" }` (code up to 12 KB; optional marker comment up to 1000 characters) | Local syntax check or AI recommendation, original code and diff |
| POST | `/api/answer-groups` | JSON `{ "question_type": "short-answer", "unicode_spaces": [], "answers": [{ "submission_id": "s1", "student_id": "s1", "question_id": "q", "answer": "…" }] }` | Exact groups and chart counts; one question, up to 10,000 responses and 10 MB |
| POST | `/api/test-runs` | JSON `{ "questionKey": "canvas:3081194", "code": "…", "variant": "original" }` | 202: queued job with unique ID and code digest |
| GET | `/api/test-runs/<run-id>` | None | Progress or per-case expected/actual results; infrastructure errors stay separate |
| GET | `/api/health` | None | Python server readiness |
| POST | `/api/canvas/preview` | Original CSV bytes (`text/csv`, up to 10 MB) | Questions, students, original answers, and validation issues |
| POST | `/api/rubric/import` | DOCX bytes or JSON `{ "text": "…" }` (up to 2 MB) | Editable rubric blocks and warnings |
| POST | `/api/rubric/convert` | DOCX bytes (up to 2 MB) | Base64 PDF; requires LibreOffice |
| GET | `/api/demo/sample-exam` | None | Prepared local sample, or 503 if not prepared |

The default sample is bundled in the frontend for offline use. The optional sample API reads `backend/data/sample-exam.json`, prepared with `python3 -m backend.scripts.build_sample_exam`.

The existing parsers remain in `backend/services/canvas_import.py`, `backend/services/rubric_import.py`, and `backend/services/rubric_preview.py`. Saved exams, answer groups and marks remain in persistent local browser storage; these endpoints process uploads without writing to the database.

## Running separately

From the project root: `python3 backend/api/server.py` (or `python3 -m backend.api.server`). From `frontend/`: `npm run dev:frontend`.

For custom ports, use `BACKEND_PORT=8002 npm run dev -- --port 5175`. For an existing API, use `API_PROXY_TARGET=http://127.0.0.1:8002 npm run dev:frontend`. Set `PYTHON` to a Python executable if necessary. Restart development after editing Python files. Production hosting needs its own `/api` forwarding configuration.

## Verification

From the project root: `python3 -m unittest discover -s backend/tests -p 'test_*.py'`.

From `frontend/`: `npm run test`, `npm run build`, `npm run test:e2e -- canvas-upload.spec.ts exam-files.spec.ts`, and `npm run test:e2e:rubric`. Browser tests use separate ports and start their own services.


## Automated tests

`runner.py` validates HTTP requests and `../../auto_marking/jobs.py` schedules bounded Docker jobs through `auto_marking/test_runner/execute.py`. The browser client is `frontend/src/api/testRuns.ts`. Variants are `original` and `recommendation`; each result includes its question key, variant, and exact code digest to prevent showing another run's results. The Sample exam has 27 registered question suites (117 checks), covering expression outputs, assignments, code completion, selected debugging answers and Q32–34. Legacy Q5 (`demo:5`) also has its existing suite. The remaining sample questions return a specific human-review explanation; their UI shows a checklist instead of an unsupported run button. See [coverage](../../docs/sample-test-coverage.md). Unsupported questions return 422, full queues return 429, and missing/expired result IDs return 404. Test jobs never change marks. See [runner setup](../../auto_marking/test_runner/README.md).

## Local AI recommendations

`ai.py` validates requests; `../../ai_tools/ai_recommendation.py` coordinates syntax checks and local inference; `../../ai_tools/code_repair/model.py` loads the pinned Qwen checkpoint once when the API starts and releases it on shutdown. The browser client is `frontend/src/api/ai.ts`. Parseable code returns `already_valid` without running inference. Invalid code returns `repaired` or `invalid_generation`, with no mark changes or code execution. Responses cannot be cached. A busy model returns 429, and unavailable models return 503; manual marking remains available.

Model installation is exposed by `GET /api/ai/model` (status), `POST /api/ai/model/download` (start/resume) and `POST /api/ai/model/cancel` (pause). The two mutations allow a real coordinator with CSRF verification, or the enabled local demo with the app/demo request headers. A local browser origin is required; remote shared origins cannot install models. Downloads report actual bytes and are single-flight; partial files are retained for retry. The request body must be `{}`.

Model setup and options are in [ai_tools/code_repair/README.md](../../ai_tools/code_repair/README.md). A complete local snapshot enables inference. `AI_REPAIR_ENABLED=0` disables inference. Inference uses cached files only; explicit downloads run in the background while the UI polls progress. Browsers never choose the model or supply executable paths.

## Docker lifecycle

The API manages local Docker Desktop on macOS before model preload. An existing engine or Desktop session is reused and left open. Shutdown cancels queued test jobs, waits for active jobs, releases AI, then stops Desktop only if this process started it, the engine is unchanged, and no containers are running. Docker failures leave manual marking available. `DOCKER_AUTOSTART=0` disables automatic management. Remote engines, alternative contexts, and other platforms require manual startup. Build `automarktic-runner:local` once separately.

## Answer grouping

`grouping.py` exposes the supplied `auto_marking.answer_grouping` module in spaces-only mode for short answers and exact mode for expression outputs. The existing syntax-aware module default stays available to Python callers. The UI validates complete membership and original responses before saving compact group snapshots. Human group marking uses the same category validation as individual marking, performs one browser-storage save, and records the affected students, marker, time, previous scores and new score. Unicode rules only replace supported space characters after explicit review. Exam state is saved locally in this browser; local account authentication is enforced; shared exam database transactions, locks and backup services remain separate work.

## Account routes and permissions

All ordinary API routes require a verified account session. `/api/health` and account setup/login/session/recovery routes are public as appropriate. The backend Host must remain local; browser origins must be local or exactly match the opt-in HTTPS `APP_PUBLIC_ORIGIN`. The application header is checked on authentication mutations; signed-in mutations require the session-bound CSRF token. Cookies are HttpOnly and SameSite=Strict. For temporary Cloudflare sharing, use the [account guide](../../docs/accounts.md#temporary-sharing-with-cloudflare-tunnel). The browser clients all use the shared account-aware request function.

| Method | Route | Access |
| --- | --- | --- |
| GET | `/api/auth/status` | First-account setup availability |
| GET | `/api/auth/session` | Return the current verified user or null; polling does not extend idle time |
| POST | `/api/auth/register` | First coordinator setup, then invitation-only registration |
| POST | `/api/auth/login` | Valid email/username and password; rate-limited |
| POST | `/api/auth/logout` | Revoke the current session and expire the cookie |
| POST | `/api/auth/activity` | Signed-in user activity; updates the idle timeout |
| GET | `/api/auth/accounts` | Coordinator only; no password/token hashes are returned |
| POST | `/api/auth/invite` | Coordinator creates an email-bound Tutor/Coordinator invitation |
| POST | `/api/auth/reset-code` | Coordinator creates a one-time password-reset code |
| POST | `/api/auth/reset-password` | Email-bound valid code and new password |
| POST | `/api/auth/change-password` | Signed-in user with the current password; revokes every account session |

CSV preview and rubric upload/import routes are coordinator-only. Answer grouping, test jobs and AI review are available to both authorized roles. Real account identity is never taken from browser role flags. The local demo is enabled by default for app features, including imports, grouping, AI fixes and Docker runs. Demo requests must include `X-Automarktic-Demo: 1`; mutations also require `X-App-Request: AutoMarktic`. Local Host/Origin checks still apply. Demo headers never authorize real account management routes. Set `ALLOW_DEMO_API=0` to disable this access.

Account/session storage is in `backend/security/accounts.py`. See [accounts and recovery](../../docs/accounts.md), [architecture](../../docs/architecture.md), and [verification](../../docs/testing.md).

Expression-output questions also support `POST /api/answer-groups`: send `question_type: "expression-output"` and an empty `unicode_spaces` list. Only identical output strings group together; all whitespace, quotes, case and punctuation remain significant. Short-answer grouping keeps its existing spaces-only behavior.
