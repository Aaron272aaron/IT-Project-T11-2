# AutoMarktic

A local marking app for reviewing exam responses, grouping short answers and expression outputs, running isolated Python tests and requesting local AI syntax fixes. Human markers confirm all final marks.

## Start the app

On a new laptop, double-click **Setup-macOS.command** or **Setup-Windows.cmd**. The runner installs Python, Node.js and the required tools, then opens the app. See [first-run setup](setup/README.md). Open the demo or sign in as a coordinator and choose **Download AI model** in **Local AI setup** to see download progress.

If dependencies are already installed:

```bash
cd frontend
npm ci
npm run dev
```

Open the local address printed in the terminal (normally `http://127.0.0.1:5173`).

1. Click **Sign up** to create the first coordinator account.
2. Use **Workspace members** to create invitations for additional Tutor or Coordinator accounts.
3. If earlier saved exams are present, review **Your existing saved exams** to copy them into the signed-in workspace. Original saved copies remain available.
4. Create/open an exam, review its question classifications and rubrics, then begin marking.

**Explore demo workspace** opens the full demo, including CSV/rubric imports, answer grouping, AI code fixes and Docker test runs. You can also log in with `demo` / `demo1234`. Start with `npm run dev` for all features; `dev:frontend` alone supports the offline screens. Demo exams remain separate from real-account exams. Set `ALLOW_DEMO_API=0` to require real accounts for backend features.

After sign-in, AI corrections prepare automatically for all loaded Coding/Function responses. The progress bar shows checked responses out of the total. You can keep marking, pause/resume preparation, and open prepared corrections from each response. If the model needs setup, preparation resumes when it becomes ready.

Press **Ctrl+C** to stop the app. It finishes active jobs, releases AI memory and, on macOS, stops Docker Desktop if it started Docker and no containers remain. Closing a browser tab does not stop the local services.

## Project map

| Folder | Contents |
| --- | --- |
| [`ai_tools/`](ai_tools/README.md) | Local AI model and syntax-fix recommendations |
| [`auto_marking/`](auto_marking/README.md) | Answer grouping, test jobs, Docker runner, test cases and verification tools |
| [`frontend/`](frontend/README.md) | Website interface: pages, components, styles and browser tests |
| [`backend/`](backend/README.md) | API routes, accounts, upload processing and integration tests |
| [`database/`](database/README.md) | PostgreSQL schema and management tools |
| `data/` | Original supplied course files and sample inputs |
| `docs/` | Accounts, architecture and verification guides |
| [`setup/`](setup/README.md) | Windows/macOS installation and launch tools |

Private account files are kept in ignored `backend/data/private/`. AI caches, virtual environments, generated test reports and temporary submissions are also excluded from Git.

The Python environment is stored in `.venv-ai/`; model files are stored in `.ai-model-cache/` after you download them. Start the app from `frontend/` as shown above.

## Guides

- [New laptop setup and model download](setup/README.md)
- [Accounts, login, logout and recovery](docs/accounts.md)
- [Architecture and storage boundaries](docs/architecture.md)
- [Tests and verification commands](docs/testing.md)
- [Sample exam test coverage](docs/sample-test-coverage.md)
- [Frontend guide](frontend/README.md)
- [API reference](backend/api/README.md)
- [Answer grouping requirements](auto_marking/answer_grouping/INTEGRATION.md)
- [Docker test runner](auto_marking/test_runner/README.md)
- [Local AI setup](ai_tools/code_repair/README.md)
- [PostgreSQL setup](database/README.md)

### Exam storage

Exam answers, attached rubrics, grouping rules and confirmed marks are saved in
`backend/data/private/exams.sqlite3`. Keep this file when moving or backing up
this installation (stop the app before copying it). The Python backend must be
running to open and save exams. `EXAM_DB_PATH` can select another database path.
Demo exams and signed-in workspaces have separate records. Older browser saves
are copied on first load when the matching backend workspace has no saved record;
the browser copies are retained. Saves use a revision check to prevent another
browser tab from silently overwriting a newer saved snapshot.

Completed AI reviews are also stored in `backend/data/private/exams.sqlite3`.
Reloading restores them before automatic review starts. Each review belongs to
its workspace, exam/student, question, exact source code and model revision.
Editing source code or choosing Retry AI correction generates a new review.
Unavailable-model errors remain retryable; completed but invalid suggestions are
remembered for manual review rather than automatically regenerated on reload.
