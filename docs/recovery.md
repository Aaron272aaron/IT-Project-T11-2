# Test results, marking history and SQLite recovery

These features extend the existing SQLite application. They do not change original answers, score calculation, authentication or the AI model.

## Saved test evidence

Completed results are saved in `exams.sqlite3`, independently of browser polling. Reopening an answer restores matching results without running Docker again. Lookup requires the same authenticated workspace (or separate local-demo scope), question key, SHA-256 of the exact code, original/recommendation variant, and version fingerprint of the test cases, runner Python sources and Dockerfile. Identical code for the same question can reuse identical evidence; this is not a student grade.

A manual **Run original tests / Run recommendation tests** always starts a fresh run. Automatic AI preparation may reuse matching completed evidence, then applies the existing rule of skipping fully passing answers. Changing the code or suite invalidates automatic reuse. Runs interrupted by a server restart show an interruption error and can be retried. Failed or unavailable runs are not reused as successful evidence. The model itself and AI repair rules are unchanged.

## Marking history

On every successful exam save, the backend appends one history event per changed/deleted student mark in the same SQLite transaction as the saved exam. It captures the authenticated account ID and name, server UTC time, workspace revision, full before/after mark objects (including score, comment and rubric description), and an available amendment/rubric-change reason. Bulk and rubric-driven score changes are recorded per affected answer. Failed/conflicting saves create no events; unchanged marks create no events.

On a shared answer's marking page, expand **Marking history**. Existing marks can be amended with an optional **Reason for mark change**. Older records load in pages of 100. No API permits rewriting/deleting history events. This is application-level append-only history, not protection against an administrator editing the SQLite file directly. Changes made before this version cannot be reconstructed. Standalone in-memory demo answers do not gain a durable history.

## Short-answer grouping

**Short answer** now uses the existing grouping UI and Python backend. By default only ordinary ASCII spaces are ignored. Case, punctuation, tabs and newlines remain significant. Optional Unicode space rules require confirmation. Original response text is preserved. Group marking still requires a rubric choice and confirmation; existing individual submission locks and backend lease conflicts remain enforced. Expression-output grouping continues to use exact text matching. There is no semantic/AI grouping.

## Automatic backups

For normal persistent application startup, the server makes a paired backup when no automatic backup exists or the last one is at least 24 hours old. It checks hourly while running. Temporary test databases do not start the automatic worker. The seven newest automatic snapshots are retained; manual/pre-restore snapshots are not pruned.

Default directory: `backend/data/private/backups/`. Override with `BACKUP_DIR` for the running server. Each snapshot has `accounts.sqlite3`, `exams.sqlite3` and `manifest.json` with hashes. The SQLite online backup API copies a consistent pair while writers are briefly paused; this includes accounts/settings, exams/attachments, marks, AI cache, test evidence and history tables. Model weights, source code and disposable runner report directories are not database backups. Failures are reported in the server terminal and retried on the next hourly check.

Run from the repository root with its Python virtual environment active:

```sh
python -m backend.backup create
```

For a custom backup location, use `--directory /absolute/backup/folder`. `AUTH_DB_PATH` and `EXAM_DB_PATH` select the source/destination databases; use the same values as the server. Do not use `AUTH_DB_PATH=:temporary:` for CLI backups.

Keep an additional copy of completed snapshots on a separate device/location. Backups on the same laptop do not protect against losing that laptop. The backup contains private account hashes and student data; do not commit it to GitHub or distribute it with demo assets.

## Restore

1. Stop the application with Ctrl+C, including all instances using these database files.
2. Choose a complete backup folder. The restore checks both checksums, database integrity and expected tables before changing anything.
3. Run:

```sh
python -m backend.backup restore \
  --snapshot /absolute/path/to/backups/SNAPSHOT_FOLDER \
  --confirm-restore
```

A pre-restore snapshot of the current pair is created first. If restoring either database fails, the previous pair is restored from that safety copy. Restoring into a completely empty destination is supported; a partially missing existing pair is rejected for manual review. The server and restore command use OS file locks to prevent restoring under a running application. Use the updated server; an old server or external database writer does not participate in these locks.

4. Restart the app and sign in again. Sessions and live marking leases are cleared during restore, so stale login tokens and lock ownership cannot revive. Review the restored exams before resuming marking.

## Verification

```sh
AI_REPAIR_ENABLED=0 DOCKER_AUTOSTART=0 python -m unittest discover -s backend/tests
cd frontend
npm test
npm run build
npx playwright test --config config/playwright/locking.ts
npx playwright test --config config/playwright/recovery.ts
```

The recovery browser suite uses disposable real accounts and the real Docker runner. Docker and its marking image must be available; no AI model inference is required. It covers short-answer grouping, group scoring, individual amendment history, reload and restoration of completed test evidence without a new test request.

SQLite schema additions are created lazily and do not rewrite existing exam JSON. The working copy's pre-existing marking-lock backend integration is included because the already-committed frontend depends on it. Other release-audit findings (export, team ACLs, broader AI repairs and GPU compatibility) are outside this change.
