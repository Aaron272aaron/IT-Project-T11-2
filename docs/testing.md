# Verification

Tests use synthetic accounts and submissions. Authentication browser tests use a disposable account database with demo access disabled; the general and live runner suites exercise default demo access on their isolated servers. No real account passwords are committed or printed.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request, and can also be
started from GitHub's **Actions → CI → Run workflow** page after it reaches the
default branch. Four independent jobs check:

- The complete backend unit/HTTP test suite with Python 3.12.
- Frontend unit tests, TypeScript checks and the production build with Node 24.
- Real login, invitation, role and session browser tests with Chrome and disposable accounts.
- All 27 automated marking suites in Docker, checking correct reference answers
  and deliberately incorrect answers against the authored cases.

Any failed test or build fails its job. New pushes cancel older runs for the same
branch or pull request. Browser reports and failure output are downloadable from
the run for seven days; failed marking jobs also retain their generated reports.

The backend job installs `requirements-ci.txt`: the root dependencies plus the
Hugging Face client needed for simulated download tests. CI does not install
PyTorch or download AI weights. AI unit tests use simulated models. Full local
model inference, installer acceptance, the other browser suites and the separate
PostgreSQL database integration are not covered by this workflow. CI uses its own
checkout and disposable test data, leaving local saved exams unchanged.

## Backend

From the project root:

```bash
python3 -m unittest discover -s backend/tests -p 'test_*.py'
```

Account checks cover password hashing, persistent sessions, invitation/recovery expiry and single-use consumption, password changes, role enforcement, CSRF/origin checks, throttling and session revocation.

## Frontend

From `frontend/`:

```bash
npm run test
npm run build
npm run test:e2e:auth
npm run test:e2e:grouping
npm run test:e2e:sample
npm run test:e2e:preparation
npm run test:e2e
npm run test:e2e:rubric
```

The authentication suite exercises real account setup, invalid and valid login, refresh restoration, invitations, Tutor restrictions, password recovery, cross-tab logout and logout failure/retry. Grouping checks use the real module and test large-cohort navigation, confirmed group marks and saved-group restoration.

See [Sample exam test coverage](sample-test-coverage.md) for all 37 question plans and the 117 authored checks. `python3 -m auto_marking.scripts.verify_sample_tests --docker` runs all automated suites against correct and deliberately wrong fixtures.

`npm run test:e2e:runner` additionally needs Docker, the built runner image and the cached local AI model. The remaining suites disable Docker/model startup as appropriate.

Browser configurations live in `frontend/config/playwright/`. The root `playwright.config.ts` is a compatibility entry point for direct Playwright commands. Results remain in ignored workflow-specific output directories.

The AI preparation suite uses synthetic student code and simulated model replies to check startup batch processing, response-count progress, one-at-a-time requests, reuse on marking pages, pause/resume, automatic continuation after model setup and logout cleanup. Unit checks also cover larger batches, changed answers and recovery from individual failures.

For formatting:

```bash
npm run format
```

## Laptop setup and model download

`backend/tests/test_setup_runner.py` checks native platform choices, checksum rejection, Windows paths, restart handling and installer failure. `backend/tests/test_model_download.py` checks byte accounting, resumed transfers, cancellation, partial caches, concurrency and account permissions without downloading weights.

From `frontend/`, `npm run test:e2e:setup` checks the actual interface with synthetic download states, including percentage, bytes, pause/resume, load progress, errors and readiness. Fresh Windows/macOS OS images are still needed for full installer acceptance testing.

## Shared answer locking

`python3 -m unittest backend.tests.test_marking_locks -v` exercises authenticated Tutors with a temporary SQLite database: simultaneous acquisition, read-only access, protected saves, lease renewal/expiry/release, same-account tabs, and group/configuration conflicts.

From `frontend`, `npx playwright test --config config/playwright/locking.ts` starts an isolated backend with AI and Docker disabled. Two real Tutor sessions verify editing versus read-only access, release on navigation, loading the latest confirmed mark before taking over, and fail-closed behavior on a renewal outage without discarding unsaved notes.

Leases are scoped to a workspace, exam, question and student. They last 45 seconds and renew every 10 seconds. Real leases apply to account workspaces and the database-backed Final 2026 demo exam; standalone browser-only examples are not shared workspaces. Marking saves and lease checks run in the same SQLite transaction. Existing workspace revision checks also reject stale snapshots; a stale workspace save must be refreshed and reviewed before retrying.

## Recovery and short-answer grouping

See [recovery.md](recovery.md) for automatic/manual backup and offline restore commands, durable test results, per-answer marking history and short-answer grouping rules. `backend/tests/test_recovery.py` covers cross-process result reads, suite invalidation, authenticated audit events, failed-save exclusion, backup integrity, live-restore refusal, failure rollback, retention and session invalidation. `frontend/config/playwright/recovery.ts` verifies real-account grouping/history and real Docker evidence restored on reload.

Verified on 8 November 2026: 139 backend tests, 96 frontend unit tests, production build, 7 account browser tests, the two-tutor locking browser test and the recovery browser workflow passed. The recovery test uses real Docker execution; it does not run model inference. Existing unrelated demo browser-suite failures from the release audit are outside this fix.
