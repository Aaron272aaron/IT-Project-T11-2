# Architecture and ownership

The frontend displays exam data and asks the local API to process uploads, group answers, run tests or suggest syntax fixes. The API checks account sessions and roles before calling those modules. No student code is sent to a hosted AI service.

## Frontend

- `src/auth/`: session lifecycle and identity.
- `src/api/`: HTTP contracts and clients; all protected calls use the shared account-aware request function.
- `src/pages/auth/`: login, first-account setup, invitation registration and recovery forms.
- `src/pages/workspace/`: separate workspace, member-management and user-settings screens.
- `src/components/auth/`: invitations, password changes and saved-exam import.
- `src/components/marking/`, `src/components/rubric/`: grouping, AI/test evidence and human marking controls.
- `src/models/`, `src/utils/`: domain data and validation/marking operations.
- `config/playwright/`: base, sample, rubric, runner, grouping and authentication test configurations.

`src/state.tsx` coordinates browser-saved workspace and exam state. The account provider determines identity and permissions. Account identity cannot be granted by editing the stored `logged` or demo-role fields.

## Backend

- `api/`: request parsing, HTTP responses and access checks.
- `security/`: local credentials, sessions, invitations and password recovery.
- `services/`: original CSV/rubric processing.
- `scripts/`: sample preparation and device-owner account recovery.
- `tests/`: synthetic unit and HTTP checks. Route-specific test servers send explicit demo headers; authentication tests disable demo access and verify protected account behavior.

## AI tools and auto marking

`ai_tools/` contains local model loading and syntax repair in `code_repair/`, and shared inference coordination in `ai_recommendation.py`.

`auto_marking/` contains the grouping algorithm in `answer_grouping/`, isolated execution and cases in `test_runner/`, bounded background jobs in `jobs.py`, Docker lifecycle management in `docker_lifecycle.py`, and suite preparation/verification in `scripts/`.

Their HTTP adapters live in `backend/api/`; their integration checks remain in `backend/tests/`. The frontend imports the shared suite catalog from `auto_marking/test_runner/questions/sample-exam.json`.

## Storage

Accounts and sessions are stored in private local SQLite storage. Real-account exam registries are persisted in local browser storage under the verified workspace ID; offline demo exams retain their existing storage key. Logout revokes the session while preserving saved exam data. Clearing browser data removes browser-saved exams; deleting account storage removes accounts and sessions. Neither should be treated as a backup strategy.

The PostgreSQL schema under `database/` is preserved independently. Cross-browser exam synchronization, shared database marking transactions and automatic exam backups remain separate work.

## Lifecycle

The combined frontend launcher owns shutdown, starts the Python API, waits for Docker and enabled AI preload, then serves the website. On exit, the API drains active test jobs, releases the AI model, closes the Docker session it owns when no containers remain, and removes disposable test-account storage. Existing Docker sessions and active containers keep Docker open.
