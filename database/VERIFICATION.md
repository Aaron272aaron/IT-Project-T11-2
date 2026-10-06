# Database verification — 5 October 2026

Verified locally with PostgreSQL 18.6 (Apple Silicon Docker image) and
DBeaver Community 26.2.2 on branch `feature/39-database`.

- Visually read the Confluence Database Model image (page 7274651, version 1).
- First-run initialization in a separate empty-volume container created all
  ten diagram tables, `mark_history`, service roles, indexes, functions and views.
- The working database is reachable at `127.0.0.1:5432`; DBeaver's
  `AutoMark Local` connection shows all eleven tables.
- Synthetic SQL checks passed for repeated question numbers across exams,
  preserved code whitespace, cross-exam/type/group foreign keys and duplicates.
- Human marking checks passed for positive/bounded marks, required final scores,
  append-only history, expired leases, lock ownership and stale-save rejection.
- Independent concurrent sessions competed for the same answer: exactly one
  tutor obtained its lease. Two competing version-zero saves also had one winner.
- The worker cannot assign human marks or approve its own AI suggestions.
  Corrected-code results must reference a review of the same answer; runner errors
  cannot be represented as scored zeroes.
- A populated synthetic backup was restored into a fresh test database. Original
  answers, marks, history, AI reviews, test results and groups matched exactly.
- The backup/restore helper separately restored the working database's archive
  into a new database and reinstated the service permissions.
- The DBeaver example script ran successfully as `automark_app` and rolled back.
- Restarting the working container preserved the schema. Temporary test containers
  and test databases were removed; the working database contains no demo answers.
- Python compilation and Git whitespace checks passed. Existing marking code
  was not changed.

The schema adaptations and remaining application integrations are documented in
`README.md`. DBeaver connection metadata is saved; its password is not saved.
The local screenshot is `verification/dbeaver.png` (excluded from Git).
