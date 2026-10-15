# Local PostgreSQL database — Task 39

This implements the ten entities in the [Database Model](https://jessiejosephjeyasingh.atlassian.net/wiki/spaces/CJM1P/pages/7274651/Database+Model)
(page 7274651, version 1), visually inspected on 5 October 2026.
It also implements database safeguards for the current [Requirements Document](https://jessiejosephjeyasingh.atlassian.net/wiki/spaces/CJM1P/pages/2261177/Requirements+Document).
All database data, credentials and backups stay on this machine.

## Start and stop

Install/start Docker Desktop. From **IT-Project-T11-2**:

```sh
python3 database/manage.py start
python3 database/manage.py status
python3 database/manage.py stop
```

The first start downloads the official PostgreSQL 18 image and generates random
passwords in `database/.env` (private permissions, excluded from Git).
Subsequent starts reuse the same credentials and persistent Docker volume.
Initialisation runs `init_roles.sql`, then `schema.sql`, only for a new volume.
Editing the schema file does not migrate an already-created database.
Do not delete the volume or run `docker compose down -v` on marking data.

The database listens on **127.0.0.1:5432**, with password authentication and an
dedicated Docker network. If that port is occupied, change `DATABASE_PORT` in
`database/.env` before starting and use the same port in DBeaver.
An initial download requires Internet; normal database use is local.

## Open in DBeaver Community

On this Mac, DBeaver is installed in Applications. You can open the connection
using its [documented command-line interface](https://dbeaver.com/docs/dbeaver/Command-Line/):

```sh
python3 database/open_dbeaver.py
```

On a new teammate's machine, use `python3 database/open_dbeaver.py --create`
once to add the connection before using the regular launcher.

The launcher reads `database/.env` locally and saves connection metadata without
saving the password in DBeaver. If prompted, enter `APP_PASSWORD` and leave
**Save password** unchecked. The official JDBC driver may require an initial
download. You can also create the connection manually:

1. Install [DBeaver Community](https://dbeaver.io/download/).
2. Choose **Database → New Database Connection → PostgreSQL**.
3. Enter the settings below. Read passwords privately from `database/.env`.
4. Click **Test Connection**; allow the official PostgreSQL JDBC driver download
   if requested. Click **Finish**.
5. Expand **automark → Schemas → automark → Tables**. Select the schema's tables
   and open **View Diagram** to see the relationships.

| Setting | Value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `5432`, or `DATABASE_PORT` |
| Database | `automark` |
| Username | `automark_app` |
| Password | `APP_PASSWORD` from `database/.env` |
| Schema | `automark` |

The `automark_app` account can inspect all tables and manage application data.
Human marks are saved through `save_mark`, keeping concurrency and audit checks.
Use `postgres` plus `POSTGRES_PASSWORD` only for schema administration, backups,
or recovery. Run the SQL in `examples.sql` in DBeaver to practise on synthetic
records inside a transaction that is rolled back.

## Diagram mapping and necessary corrections

| Diagram entity | PostgreSQL table | Adaptation |
| --- | --- | --- |
| Tutors | `automark.tutors` | Lowercase name; nullable self-reference for the coordinator |
| assignments | `automark.assignments` | `DATETIME` becomes `timestamptz` |
| questions | `automark.questions` | Add unique `id`; keep `question_num` unique within its assignment |
| submissions | `automark.submissions` | One submission per assignment/student; student ID remains a Canvas identifier |
| answers | `automark.answers` | `LONGTEXT` becomes `text`; keep original whitespace; enforce matching assignment/type |
| marks | `automark.marks` | One current human mark per answer; decimal marks; status and save version |
| answer_groups | `automark.answer_groups` | Group key unique within a question; decimal suggested marks |
| answer_group_members | `automark.answer_group_members` | Enforce that the group and answer belong to the same question |
| automated_results | `automark.automated_results` | Run UUID, JSON report, suggested score and optional link to corrected-code review |
| AI_reviews | `automark.ai_reviews` | Rename `idAI_reviews` to `id`; store correction, model, explanation and tutor decision |

The diagram makes `question_num` a primary key and gives answers a `question_id`
without a corresponding `questions.id`. A surrogate ID resolves that ambiguity
and permits question 1 in several exams. Added `answers.assignment_id` and
`answer_group_members.question_id` support composite foreign keys that reject
cross-exam answers and cross-question grouping.

The diagram omits enum members. This implementation uses question types
`short_answer`, `code`, `function`; marking states `unmarked` (no marks row),
`draft`, `finalised`; run states `queued`, `running`, `completed`, `runner_error`;
AI decisions `pending`, `accepted`, `rejected`. These choices follow the three
question workflows in FR5.2; future types require an explicit migration.
Only one answer group per answer and one submission per student/exam are allowed.
Subquestions/attempts would require an explicit model extension.

One additional table, `mark_history`, stores append-only snapshots of each human
mark/feedback/status change. Two views expose marking progress and final marks:
`answer_marking` and `final_marks`.

## Backend connection and marking contract

FastAPI/service code should connect as `automark_app`; local test/AI workers
should use `automark_worker` and `WORKER_PASSWORD`. Keep the administrator
password out of both. A Python database driver or ORM is not yet installed.
Connect to host `127.0.0.1`, port `DATABASE_PORT`, database `automark`; qualify
tables/functions with `automark.`. If FastAPI later runs in Docker, connect to
service `database` on port `5432` on the Compose database network.

For a human mark, authenticate/authorise the tutor in the backend, then:

```sql
SELECT automark.claim_answer(:answer_id, :authenticated_tutor_id);
-- Continue only when true. The lease lasts five minutes; renew while editing.
SELECT automark.save_mark(
    :answer_id, :authenticated_tutor_id, :mark, :notes,
    :status, :expected_version
);
SELECT automark.release_answer(:answer_id, :authenticated_tutor_id);
```

These are parameter placeholders for your driver, not executable DBeaver syntax.
Read `version` from `answer_marking`; use 0 for a previously unmarked answer.
The returned version must accompany the next save. A stale save raises SQLSTATE
`40001`; a missing/expired lease raises `55P03`. Reject the request and reload
the current record instead of silently overwriting it. Commit saves promptly.
Use one transaction when applying human marks to an entire answer group; claim
answers in ascending ID order and roll back the whole group on a conflict.

Database login roles are service accounts, **not** individual tutor authentication.
The backend must derive tutor IDs from the authenticated session, enforce
coordinator permissions, and enforce lease ownership on private answer reads.
The worker cannot write human marks or invoke human marking functions.
Worker results and AI decisions never automatically create a human mark.

## Verify, back up and restore

```sh
python3 database/manage.py test
python3 database/manage.py backup
python3 database/manage.py restore database/backups/YOUR_BACKUP.dump --database automark_recovered
```

Tests use a newly created disposable database, including separate concurrent
sessions. They never insert test records into the working `automark` database.
Backups use `pg_dump` custom format, local private files, a unique filename,
and validation before the file is marked complete. They include all schema data,
human history, AI suggestions and test results. Keep `database/.env` separately
protected: database roles/passwords are not part of a database-only archive.

Restore always creates a **new** database and refuses an existing name. It
restores in a single transaction and reapplies service-role permissions. Verify
the recovered database in DBeaver before switching backend connection settings.
The helper does not schedule backups or notify coordinators; that application
integration remains necessary for QR2.5. No migration framework, API routes,
tutor registration, group-marking UI, CSV importer/exporter, AI-code cleanup,
or test/AI audit event history is implemented by this database task.
