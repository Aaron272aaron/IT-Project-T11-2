AutoMarktic - Project 2 laptop transfer
Created: 2026-10-15T14:12:20+11:00

1. Copy this ZIP to the other laptop and extract the entire "Project 2" folder.
2. Keep the folder in a writable local location, such as Desktop or Documents.
3. On macOS, double-click Setup-macOS.command.
   On Windows, double-click Setup-Windows.cmd.
4. Complete any installer prompts. Initial setup needs internet access for
   the native Python/Node dependencies and, if missing, Docker/LibreOffice.
5. Open Explore demo workspace to see the saved Sample exam and Final 2025.
   Existing account users can sign in with their existing credentials.

PRESERVED DATA
- Current saved exams, all student submissions, confirmed marks and comments.
- Uploaded rubrics/documents, question types, group data and lock examples.
- Completed cached AI reviews. The AI model is excluded from this ZIP.
- Account database, password hashes and its application settings.
- All existing database backup files and example CSVs.

The current databases are consistent SQLite snapshots, including committed WAL
data if any. They are already at backend/data/private/ in the extracted project;
there is no separate import or restore step. Do not replace them with an empty
database when setting up the new laptop.

The AI model is not included. After setup, open Local AI setup on the dashboard
or under User settings and choose Download AI model when ready. Manual marking
remains available without the model.

MACHINE-SPECIFIC ITEMS
Python virtual environments, downloaded runtime/install caches, node_modules
and Python bytecode are recreated by the setup launcher. A Docker image lives
outside the project and is rebuilt by setup for the target laptop.
Browser cookies, active login sessions and browser-only profile/view preferences
are not transferred. Sign in again or select Explore demo workspace as above.

See TRANSFER-MANIFEST.json for the snapshot counts and SHA-256 of every file.
The archive was checked by decompressing and hashing every archived file and
reopening the extracted current databases with SQLite integrity checks.
