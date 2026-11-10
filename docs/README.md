# Documentation index

- [Architecture](architecture.md): current implementation and differences from the original design.
- [Requirements](requirements.md): 55 source requirements, acceptance checks and implementation gaps.
- [Accounts](accounts.md): authentication and local sharing.
- [Recovery](recovery.md): test evidence, audit history, backups and restoration.
- [Testing](testing.md): test commands and dated evidence.
- [Sample test coverage](sample-test-coverage.md): configured suites.
- `sources/`: Confluence source extracts and diagram screenshots (team material).
- `archive/`: retained historical documentation, not the current implementation reference.

The project root contains launchers and dependency manifests. `frontend/`, `backend/`, `ai_tools/` and `auto_marking/` remain the runtime modules. `data/samples/` holds source fixtures. `database/` is independent PostgreSQL reference tooling, not the active SQLite database. The root 2,000-student CSV is retained because existing tests and preparation scripts reference it.

Private databases, backups, model caches and virtual environments are local runtime assets, not release source files.
