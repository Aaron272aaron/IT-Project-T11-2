# AutoMarktic React Frontend

Implemented from the Figma `Prototype Pages (Copy)` design (file `RkRQ0I0xUoWPdVjxhvnvf4`). The stack is **React + TypeScript + Vite + plain CSS**. Automated test execution is in `auto_marking/test_runner/`; local AI tools are in `ai_tools/`.

## Running the app

Requires Node.js 22.13+ or 24+ (PDF.js requirement; verified locally with Node 24).

```bash
cd frontend
npm ci
npm run dev
```

`npm run dev` starts both the Python API (port 8000) and the frontend (port 5173). Press Ctrl+C to stop both. Python 3 must be installed; the API uses the standard library.

Open the local URL shown in the terminal, which defaults to `http://127.0.0.1:5173`. On the login page, click **Explore demo workspace**, or use the username `demo` and password `demo1234`.

```bash
npm run test        # Unit tests for CSV validation and marking rules
npm run test:e2e    # Browser page and workflow tests; requires Google Chrome
npm run build      # TypeScript checks and production build; outputs to dist/
npm run preview    # Preview the production build
npm run format     # Format the code
```

`test:e2e` automatically starts a separate Python service (8001) and frontend development server (5174). It does not reuse manually started services. Full browser-test configurations are in `config/playwright/`; `playwright.config.ts` remains a compatibility entry point.

## Python CSV service

Start both services with `npm run dev` as described above. To run them separately, use `python3 backend/api/server.py` from the project root and `npm run dev:frontend` from the frontend folder. From the demo Subject dashboard, click **Create exam** or open an existing exam. Within the exam, click **Upload answer CSV**, select a file, and click **Validate and preview**. The page sends the file to the local Python service, which calls `backend/services/csv_parser.py` and returns the answers for display. See the [backend documentation](../backend/README.md) for full startup instructions, a walkthrough, and troubleshooting.

The old Python connection test button and its dedicated code have been removed. The upload workflow itself reports connection failures. The backend `/api/health` endpoint remains only as a readiness check when automated tests start the service.

## Implemented pages and design mapping

URLs use hash routing, for example `http://127.0.0.1:5173/#/members`. Enter the demo before visiting these pages for the first time.

| Page or state | Route | Figma node |
| --- | --- | --- |
| Login: normal and error states | `#/login`, `#/login/error` | `2205:5`, `2205:44` |
| Legacy Ocean login color variant | `#/login/ocean` | `1:2` (reuses the login form with an alternative color scheme) |
| Subject dashboard | `#/dashboard` | `4259:143` |
| Create workspace | `#/create-workspace` | `4267:192` |
| Member list and member management modal | `#/members` | `4259:145`, `4261:197` |
| Workspace settings | `#/workspace-settings` | `4259:146` |
| User settings | `#/user-settings` | `6218:244` |
| Exam overview | `#/exam/final` | `4249:2` |
| Import: upload, validation errors, ready to import, progress, and completion | Interactive workflow within `#/exam/final/import` | `4254:528`, `4254:602`, `4254:677`, `4254:747`, `4254:808` |
| Short-answer group overview | `#/question/1` | `4275:301` |
| Short-answer marking | `#/question/1/mark/demo001` | `6256:336` (original `4275:492` retained) |
| Programming answer overview | `#/question/5` | `4275:772` |
| Function answer marking with AI comparison | `#/question/5/mark/demo001` | `6256:484` (original `4276:262` retained) |
| Coordinator score review | `#/exam/final/review` | `6257:393` (confirmation modal `6258:427`, completed state `6262:417`) |
| Executable-code marking | `#/question/3/mark/demo001` | `6256:644` (original `4276:361` retained) |

Additional routes include the exam list at `#/exams`, an archived preview at `#/exam/midterm`, and a draft preview at `#/exam/practice`. The complete interactive demo is centered on **Final exam**. Questions 2, 4, and 6 reuse the pages for their respective question types. The member management area, which was an empty container in the original Figma design, has been implemented as a working modal.

The sidebar, buttons, forms, tables, and cards are shared components. Mobile screens use a collapsible sidebar, and wide tables scroll horizontally within their containers. Progress figures are calculated from the demo answers rather than copying inconsistent static counts from Figma. The legacy Ocean page is a color variant of the shared login form, not a pixel-for-pixel recreation of the old design.

## Available interactions

- Create and switch workspaces; answers in a new workspace are separate from those in other workspaces.
- Edit workspace and user profiles; session data persists when the current tab is refreshed.
- Search, add, change roles, and remove demo members; no real emails are sent.
- Filter by student ID, marking status, or answer group; navigate pages and inspect original answers.
- Drag and drop or select a CSV, validate it, download an issue list, and import it; valid and invalid examples are provided.
- Choose one rubric category for the whole answer, add a comment, and confirm the mark or move to the next unmarked answer.
- As a Subject coordinator, open **Review rubric scores** from the exam overview, adjust category scores by question, preview changes to student totals, enter a reason, and confirm recalculation. Change records are saved in the current session.
- Mark an entire group of identical short answers after reviewing the affected count and the warning about replacing existing marks. Locked demo answers are skipped.
- Export confirmed marks as CSV, including the rubric category, score at category selection, and current score. Text fields are escaped to prevent formula injection.

## Category marking and score review

Each question currently has three categories: Fully correct, Partially correct, and Incorrect. Their default scores are full marks, half marks, and zero. Each answer receives one category. The **Assessment guidance** on the left supports that decision; its items are not scored separately and added together.

For example, changing Q5's Partially correct score from 7.5 to 9 sets all already marked Q5 answers in that category within the workspace to 9. Other questions, other categories, and unmarked answers remain unchanged. Future selections of that category also receive 9. Before applying the change, the coordinator can review affected counts and student totals. Confirmation records the actor, reason, before-and-after values, and affected students. Scores must be between zero and the question maximum, with at most two decimal places. If any affected answer is locked, the entire adjustment is blocked.

Numeric marks from older sessions that have no category are retained and clearly flagged; the system does not infer categories from old scores. Totals for students whose marking is incomplete are labeled **Provisional** and include confirmed marks only. Category settings, answers, and adjustment records are isolated by workspace.

## Creating exams, rubrics, and answer files

Click **Create exam** from the Subject dashboard or Exams page to open `#/create-exam`. An exam name is required. The rubric is an optional Word or PDF file (`.docx` or `.pdf`, up to 2 MB); an exam can be created without one. Rubric and criteria refer to the same document here, not a CSV file.

After creation, the app opens `#/exam/<id>`. On the exam page, a rubric can be added or a replacement selected. It is saved only when **Save rubric / Replace rubric** is clicked. An invalid file or insufficient browser storage leaves the previous file intact. A saved rubric can be downloaded unchanged. It serves as a reference document and does not automatically generate categories or change confirmed marks.

Answer uploads belong to a specific exam: **Upload answer CSV** → `#/exam/<id>/answers/upload` → select a file → **Validate and preview** → **Save answers to exam**. If the exam already has answers, a confirmation dialog appears before replacement. After saving, return to the exam and click **View uploaded answers** to inspect the original text. Files are isolated by exam and workspace.

Answer files are read and validated by Python's `backend/services/csv_parser.py`. It supports Canvas **Quiz Student Analysis Report** files, with one student per row and paired question/score columns. Files must use UTF-8 and contain no more than 10,000 students or 10 MB. The supplied sample contains 4 students, 37 questions, and 7 instructional sections: 148 gradable answers, or 176 entries including instructional sections.

Exam details, original rubric files, groups, approved rules and confirmed marks are saved in `localStorage` (`automarktic-exams-v1`) and mirrored to the older `sessionStorage` key. They restore after closing and reopening in the same browser. Clearing browser data removes them. This is not database or server storage. Multiple files may reach the browser's total storage limit. Save failures are reported explicitly, and the last successfully saved data is retained. Unsaved previews are discarded when navigating away or refreshing.

The legacy `#/import/canvas` URL returns to the exam list to prevent uploads without an associated exam. The standardized CSV import for the original six-question demo is at `#/exam/final/import`; old `#/import` bookmarks redirect there. Demo marking records remain separate from newly uploaded raw Canvas answers.

Code responsibilities: `src/pages/exams/ExamSetup.tsx` creates exams and manages files; `src/components/rubric/RubricPicker.tsx` reads Word/PDF files; `src/models/exams.ts` manages exam data; `src/state.tsx` stores data for the current tab; `src/pages/imports/CanvasUpload.tsx` uploads, previews, and saves answers; and `src/api/canvas.ts` calls Python's `POST /api/canvas/preview`. The original CSV module and test materials have not been rewritten.

## Import format

The standardized import reads CSV files with one answer per row. **It cannot directly import arbitrary raw Canvas exports.** First convert the Canvas export to the following column names. A template is available for download on the page:

```csv
student_id,question_id,answer
student241,1,"3, because the list has three elements."
student241,5,"def clean_text(s):
    return s.strip().lower()"
```

- `question_id` must be 1–6; each file may contain up to 10,000 rows and 10 MB.
- Quotes, commas, and multiline code are supported. Original spaces, indentation, and line breaks are preserved.
- Missing columns, missing student IDs, empty answers, invalid question IDs, or duplicate student/question records block the import.
- Existing student/question records in the same exam are not overwritten by an import.
- Short answers are grouped only when their full text matches exactly; potentially meaningful whitespace is not ignored.

## Code organization

| File | Responsibility |
| --- | --- |
| `src/main.tsx` | Entry point and routing; selects the current page |
| `src/components/Layout.tsx` | Shared sidebar, workspace switching, account access, and mobile navigation |
| `src/components/UI.tsx` | Shared cards, buttons, forms, dialogs, and progress bars |
| `src/pages/workspace/Workspace.tsx` | Workspace creation/settings, member management, and user settings |
| `src/pages/exams/Exams.tsx` | Dashboard, exam list, and exam overview |
| `src/pages/imports/Import.tsx` | Five-stage import workflow |
| `src/pages/marking/Questions.tsx` | Grouped/programming answer overviews and the three marking page types |
| `src/pages/marking/Review.tsx` | Coordinator category-score adjustments by question, student total previews, and history |
| `src/utils/rubric.ts` | Category defaults, category marking, bulk adjustment validation and audit records, and total calculations |
| `src/pages/auth/Login.tsx` | Demo login and error/help states |
| `src/models/domain.ts` | Data types, sample questions, CSV validation, grouping, and marking constraints |
| `src/state.tsx` | Shared React state, durable exam storage and session mirror |
| `src/styles.css` | Figma colors, sizing, typography, layouts, and responsive styles |
| `tests/`, `e2e/` | Data-rule tests and browser workflow verification |

Example: select **Partially correct** → click **Confirm category & mark** → `saveCategoryMark` retrieves the score from the question's current category settings → checks the lock state → saves the category, score, and comment → React updates the overview. When a coordinator submits an adjustment, `applyCategoryScores` updates the category settings, matching answer scores, and change records together. The original answer string remains unchanged.

## Current limitations and future integration

This is a **runnable, interactive frontend prototype**, not a complete production system.

- Demo login (`demo` / `demo1234`) and **Explore demo workspace** provide all demo workflows, including local AI fixes and Docker tests when both services are started. Demo roles and lock labels are UI previews. Real accounts use verified backend sessions and roles.
- Demo account and workspace-session flags remain in `sessionStorage`. Saved exams, groups and marks use local browser storage and restore after reopening in the same browser. Shared exam database persistence remains separate work; clearing browser data removes local records.
- Configured function cases execute locally in Docker, and syntax repair uses the cached local Qwen model. Unsupported questions report missing test cases. Browser code does not execute student Python.
- Test results only inform category selection; a human must choose and confirm the category. AI suggestions do not replace original answers or automatically assign marks.
- Registration, password recovery, real invitations, multi-user marking locks, and permanent storage require backend support. The interface explains unavailable integrations rather than pretending these actions succeeded.
- CSV uploads are connected to Python through `POST /api/canvas/preview`, using `backend/services/csv_parser.py` for reading and validation. Unsaved previews are cleared on refresh; answers saved to an exam can be restored after refreshing the current tab. Database persistence is not integrated; the isolated Python runner and local model use the API. The browser does not connect directly to a database or run `run.sh`.

Recommended backend interfaces include workspace/member/exam/answer CRUD, CSV import jobs, marking confirmation, test jobs, suggestion jobs, locks, and audit records, as well as rubric category management by exam/question and atomic bulk score adjustments. The backend must independently validate permissions, score ranges, version conflicts, and original-answer immutability. Frontend validation must not be treated as a security guarantee. The choice between a single-machine deployment and a shared server remains to be determined.

The Figma logo is stored locally at `public/logo-code.svg`, and fonts are provided locally through an npm package. Normal use of the interface does not depend on temporary Figma asset URLs.

## Rubric page mapping and Tutor preview

1. Open an exam as **Coordinator**. Upload an optional PDF or DOCX rubric and save it. PDFs are parsed locally by PDF.js; DOCX files are converted by the local Python API using LibreOffice. The original download is unchanged.
2. In **Rubric pages by question**, use **Preview rubric** to check the document. Enter a start and end page for each question, then click **Save page assignments**. These are the preview's physical pages starting at 1, not printed page labels. Word layout can differ between renderers, so verify the generated PDF before mapping.
3. Final exam lists its six demo questions separately from any uploaded CSV questions. New exams derive their question list from the saved CSV, excluding introduction sections. Canvas question IDs are never matched to demo IDs automatically.
4. Switch the sidebar's **Demo perspective** to **Tutor**. Open **Final exam → a question → Mark** and click **View rubric**. It opens the assigned start page and shows the assigned range. Drag the title to move the floating window and the lower-right corner to resize it. Page navigation, keyboard arrow controls on the move/resize handles, Escape to close, and original-file download are available. Marking remains usable underneath.
5. Saved real Canvas answers also have **View rubric**; selecting another question uses its own mapping. The raw answer viewer remains read-only. Open a question from the exam page to mark it using Coordinator-configured rubric options.

Unmapped questions open page 1 with an explicit message. Replacing a saved rubric clears all page assignments. Replacing the CSV clears its question assignments while preserving demo mappings. Invalid uploads, cancelled drafts and failed saves preserve the prior saved document. Existing attachments without a preview need to be uploaded again. PDF passwords are not supported.

In demo mode, the role switch is a local UI preview. It is hidden for real accounts, whose roles are verified by the server. Tutor preview hides coordinator controls and blocks direct navigation to management routes, while leaving the demo marking workflow available. Real local accounts, cookie sessions, invitations, logout and backend role checks are implemented. Shared exam synchronization, multi-user locks and PostgreSQL exam persistence remain separate work.

DOCX conversion needs the Python backend and LibreOffice. The backend looks for `SOFFICE_BIN`, `soffice` on PATH, the standard macOS LibreOffice location, and the available Codex bundled runtime on this machine. To use another installation:

```bash
SOFFICE_BIN="/path/to/soffice" python3 backend/api/server.py
```

If conversion is unavailable, the upload shows an actionable error; exporting Word to PDF and uploading that PDF works without conversion. Temporary conversion files are removed, and documents are not sent to an external viewer. Fonts and PDF decoders are copied into `public/pdfjs/` automatically before `npm run dev` and `npm run build`; this generated directory is ignored by git. Production deployment must separately route `/api` to Python.

Additional code: `src/services/rubricDocument.ts` validates documents and calls conversion; `src/utils/rubricPages.ts` defines mapping rules; `src/components/rubric/RubricPageMapping.tsx` edits assignments; `src/components/rubric/RubricWindow.tsx` renders the floating viewer; `backend/services/rubric_preview.py` converts DOCX files. Tests are in `tests/rubricPages.test.ts`, `e2e/rubric-pages.spec.ts`, and `backend/tests/test_rubric_api.py`.

## Default Sample exam (supplied local files)

The default COMP10001 workspace now replaces the old six-question Final exam with **Sample exam** at `#/exam/final`. It has 4 students, 37 questions and 100 possible marks, using the original Canvas report and Word marking guide. Other exams and workspaces are retained. The old default exam record is upgraded once per browser tab; subsequent marks, rubric changes and page assignments are not reset on reload.

The sample is bundled in the tracked static file `frontend/public/demo/sample-exam.json`, including the saved answers, categories, page mappings, original DOCX and converted PDF. Vite serves it directly and copies it into the production build. **For the offline sample demo, use `npm ci` and `npm run dev:frontend` in `frontend`; Python and LibreOffice are not needed.** Production builds can also be served with `npm run build` followed by `npm run preview`, or deployed to static hosting.

The bundled file contains the supplied student answers and rubric and is included in the downloadable frontend assets. It is demo content, not access-controlled storage. The original CSV and DOCX remain unchanged. Uploading a new Canvas CSV or converting a new DOCX still requires the Python backend; viewing and marking the bundled sample does not.

For maintainers only, to regenerate the bundled sample after reviewing source changes (Python and LibreOffice required on the maintainer's machine):

```bash
# Run from the repository root.
python3 -m backend.scripts.build_sample_exam
python3 -c "import shutil; shutil.copyfile('backend/data/sample-exam.json', 'frontend/public/demo/sample-exam.json')"
```

Commit the updated frontend fixture with the code so teammates receive it on pull. The builder's intermediate `backend/data/sample-exam.json` output remains ignored. The frontend no longer calls `GET /api/demo/sample-exam`.

`backend/data/sample_rubric.json` contains the categories transcribed from the provided guide and its source hash. The page mapping is manually checked against the 24-page preview: Q1–9 share pages 7–8; Q10–13 share 9–10; Q14–17 use 10; Q18–22 use 11; later questions use their corresponding pages through 22. Pages 23–24 contain additional material not represented by the CSV questions. If the source Word file or question IDs change, the builder stops for review rather than reusing these mappings blindly.

For a Tutor demo: **Demo perspective → Tutor → Sample exam → Open question → Mark [student] → View rubric → Choose a rubric category → Confirm category & mark**. Original student text and CSV source scores are preserved; new human decisions are separate. Q14–17 are labelled automatic in the supplied guide and are read-only source-score review, excluded from human marking progress. No automatic marker is executed. Categories select a whole-answer score; Q37 offers totals for the document's three one-mark criteria. Sections that omit an explicit zero include a clearly labelled no-credit option. Replacing the rubric clears prepared categories to avoid applying them to a different guide; it does not erase previous confirmed marks.

**Rubric pages by question** is collapsed initially. Expand it to inspect/edit mappings. The internal question list scrolls rather than pushing the rest of the page down. **Assign pages sequentially** takes a first/last question, starting page and pages per question (default 1). It replaces only that draft range; review it and click **Save page assignments** to persist. An out-of-range sequence is rejected in full. Shared-page mappings remain editable manually. The supplied sample already has the correct shared-page assignments; sequential assignment is a convenience, not automatic interpretation of the guide.

Validation commands:

```bash
npm run test
npm run test:e2e:sample  # Bundled sample; API calls blocked and no backend started
npm run test:e2e         # Existing workflow regressions using isolated legacy fixtures
npm run build
```

The regression Vite server sets `VITE_LOAD_SAMPLE_EXAM=false` to keep historical six-question fixtures independent. Normal development and the sample test configuration use the new default sample. Saved exams use persistent local browser storage; cross-browser exam synchronization and PostgreSQL exam persistence remain separate work.


## Coordinator rubric options and document import

Open an exam and expand **Rubric options by question**. Save an answer CSV first so that the exam has stable question IDs. Select a question, add/remove options, and edit each score and description. Each score appears once, with the descriptions from all options at that score combined. Scores must be between zero and the question maximum with at most two decimal places. Every option needs a description. Manual editing and marking work without Python, including in the bundled sample.

**Save rubric options → Review rubric changes → Confirm rubric changes** saves the draft. When an option's score changes, every saved mark using that same option is updated together. The review lists affected students and requires a reason; change history preserves before/after categories and scores. Removing an option preserves its historical marks and descriptions and flags those responses for Tutor review rather than inventing a replacement option. Original answers, CSV source scores and marker comments remain unchanged. Questions with no options cannot be manually marked. The Marking mode selector has been removed; existing source-score review questions keep their established behavior.

For document import, start both services with `npm run dev` in `frontend`. Expand **Automatically create rubric from document**, upload a DOCX or text-based PDF, or choose **Read saved rubric document**. Importing option text does not need LibreOffice. LibreOffice is still needed separately when uploading a DOCX as the paginated reference document.

The standard guide uses `Rubric:`, `Marks:` or `Marks for each ...` headings followed by `+2.0 Description` paragraphs. Multiple paragraphs within one score option are retained. Shared rubric sections can target several questions. Explicit question numbers are preferred; consecutive order is suggested where the guide omits them. Review and edit the comma-separated question numbers for every imported section. Supplementary lettered questions are left unassigned. Scanned/image-only PDFs are unsupported; use a DOCX or selectable-text PDF. PDF wrapping is reconstructed before parsing, but always compare the draft with the original guide. No external AI service is used.

**Apply imported draft** only updates the editor draft. It does not replace the saved reference document, PDF page assignments, or saved marks. Use the normal review/save flow to commit. Additive rules such as “1 mark for each criterion” are converted into whole-answer total options with an explicit review warning. Missing zero-mark options are reported, not silently invented. Same-score options are merged into one score option, preserving historical IDs for batch updates. Invalid associations, conflicting sections, out-of-range scores and missing descriptions block application. Unmapped sections are skipped. Unmapped questions retain their current options.

Marking initially shows score options with collapsed **Description** arrows. Selecting a radio button chooses one whole-answer score; expanding a description does not select or confirm a score. Confirming a mark records its option ID and description snapshot. New exams use the same workflow as Sample exam.

`POST /api/rubric/import` accepts DOCX bytes or JSON `{ "text": "PDF paragraph text" }`, with a 2 MB request limit. PDF.js extracts PDF text locally (up to 8 MB / 200 pages); Python's standard library parses DOCX XML and guide rules. The API returns editable blocks, proposed question numbers and warnings, never writes exam state, and does not convert Word to PDF.

Code: `src/components/rubric/RubricEditor.tsx` (Coordinator UI), `src/utils/rubricEditor.ts` (validation and batch updates), `src/components/rubric/RubricOptions.tsx` (Tutor choices), `src/api/rubric.ts` and `src/utils/pdfRubricText.ts` (upload and PDF text), `backend/services/rubric_import.py` (parsing). Run `npm run test:e2e:rubric` for the real DOCX/PDF, editing, batch update and new-exam workflows. The sample suite still blocks all API calls to verify offline demo behavior. Saved exam state and change history remain in persistent local browser storage; this is not multi-user synchronization or database persistence.


## Question classifications and AI recommendations

Coordinators can expand **Question classifications** on an exam, assign each question a type, and click **Save classifications**. Draft changes are discarded on refresh. The seven types follow the supplied exam: Expression output (Q1–9), Single assignment statement (Q10–13), Multiple choice (Q14–17), Code completion (Q18–22), Debugging (Q23–31), Coding questions (Q32–34), and Short answer (Q35–37). These are question types, separate from rubric score categories and manual/source marking modes. New exams start unassigned; the sample includes defaults, including for older browser sessions. Explicit Coordinator choices override defaults.

On a Tutor's or Coordinator's individual answer page, **Generate AI-suggested fixes** appears for **Coding questions**. The same control is available for legacy Function questions. It requests `POST /api/ai/suggest-fix`, checks syntax, and presents the original and suggested code side by side with highlighted changes. Blank responses disable the button. Both roles can reject a recommendation or continue marking manually after errors. Original answers, rubric categories and marks are never changed by this request. Parseable Python bypasses inference; syntax validity does not establish correct logic or passing tests. Click **Run original tests** on the answer page before reviewing fixes, and **Run recommendation tests** inside the AI dialog afterward. Six real cases are configured for Q32 (`similarity(board, char)`) and legacy Q5 (`clean_text(s)`). Other questions need a suite before they can be run. Results include expected and actual outputs and errors; neither answers nor marks change. Build `automarktic-runner:local` once as described in [runner setup](../auto_marking/test_runner/README.md). Run `npm run test:e2e:runner` for the real Docker/local-model workflow.

`npm run dev` uses the project's `.venv-ai` Python when installed. The pinned local Qwen model is in `.ai-model-cache/`; no student code is sent to Hugging Face or a third-party LLM. Only model files are downloaded during setup. See [`../ai_tools/code_repair/README.md`](../ai_tools/code_repair/README.md) for setup and configuration.


The **Edit question rubric** selector sits in a highlighted panel. Its menu contains only question numbers; the selected question's maximum marks and score-option count appear below. Editing a score to match another option merges their descriptions when leaving the score field. Historical marks remain linked to the merged option, and later score adjustments update every affected confirmation. The warning above the editor explains this impact.


## Frontend directory guide

- `src/pages/auth/`: login and account access screens.
- `src/pages/workspace/`: workspace, members and personal settings screens.
- `src/pages/exams/`: exam creation, lists, details and the current exam marking workflow.
- `src/pages/imports/`: CSV import and answer preview screens.
- `src/pages/marking/`: legacy demo marking and coordinator review screens.
- `src/components/rubric/`: rubric upload, editing, choices and document viewing.
- `src/components/marking/`: question classifications and AI suggestion controls.
- `src/components/profile/`: avatar display and image preparation.
- `src/components/UI.tsx` and `Layout.tsx`: shared controls and application layout.
- `src/models/`: shared data structures, demo data and question type definitions.
- `src/api/`: requests to Python for CSV preview, rubric documents, local AI recommendations, and automated tests.
- `src/services/`: local PDF document preparation and rendering helpers.
- `src/utils/`: local marking rules, rubric calculations and PDF text preparation.
- `src/main.tsx`: application startup and routing.
- `src/state.tsx`: shared state and browser-session persistence.
- `tests/` and `e2e/`: unit tests and browser workflows; their imports follow the same source folders.

This directory reorganisation does not change browser URLs, API endpoints or storage keys.


## API organisation and development ports

The backend routes are in [`../backend/api/`](../backend/api/README.md); browser requests are in `src/api/`. Vite forwards `/api` to Python. Uploaded CSVs and rubric documents use the existing Python parsers; saved exams and marks remain in persistent local browser storage.

For different ports: `BACKEND_PORT=8002 npm run dev -- --port 5175`. Set `PYTHON=/path/to/python3` if needed. If a Python service already runs, use `API_PROXY_TARGET=http://127.0.0.1:8000 npm run dev:frontend`. The combined launcher reports occupied ports rather than stopping other services. The proxy is a development feature; deployed builds need a server that forwards `/api`.

## Shared exam workspace

Tutors and coordinators use the same exam list, question list, student answers, confirmed marks, and progress within the current workspace. Both can select rubric scores, add comments, confirm marks, move to the next response, request AI syntax fixes, and run configured tests. The question list appears before exam files and setup controls for both roles. Coordinators additionally manage uploads, classifications and rubric options. Switching Demo perspective does not copy or reset exam data. Saved exam data stays in this browser; separate browsers and accounts are not synchronized by a database.

## AI startup and shutdown

`npm run dev` preloads the enabled local AI model once before the frontend becomes ready. All fixes reuse that model. Ctrl+C stops both services and releases model memory; downloaded files remain cached. An active fix may finish before cleanup. Closing a browser tab does not stop the local service. `AI_REPAIR_ENABLED=0` disables preload and inference; a model loading error leaves manual marking available.

## Docker startup and shutdown

On macOS, `npm run dev` starts Docker Desktop when needed and waits for it before loading AI. Ctrl+C finishes active tests, releases AI memory, and stops Docker if this app started it and no containers remain. Pre-existing Docker sessions and other running containers keep Docker open. Closing a browser tab does not stop the app. `DOCKER_AUTOSTART=0` disables this management; offline browser tests set it automatically. On other platforms, start Docker manually. Build the marking image once before running tests.

## Answer grouping

For a **Short answer** or **Expression output** question, the question view automatically calls the local grouping API. Click a bar to inspect its original answer, exact student count, marking status and members. Bars support keyboard selection; charts and member lists page in sets of 50 for large cohorts. Search and status filters only change the visible member list; a confirmed group mark applies to all students in the selected group.

Choose a rubric category, add an optional comment, then **Confirm group category & mark → Apply group mark**. Review the affected student count and warning about existing marks first. Individual marking remains available from both the group list and the question list. Whitespace variants are flagged for review.

Expand **Pre-processing rules** to select Unicode-space replacements. Review and apply the rules to regroup without changing originals or existing marks. Unapproved Unicode spaces, punctuation, case, tabs and line breaks stay significant. Code/function classifications keep individual review and test workflows. Existing saved groups can reopen with the API unavailable; new or changed answers need Python.

`npm run test:e2e:grouping` tests the real API with synthetic data, including confirmation, individual override, Unicode review, durable restoration, errors and 1,001 submissions. Database synchronization and multi-user locks remain separate work.

## Real accounts and logout

Start the complete app, click **Sign up**, and create the first coordinator account. Later registrations require an email-bound invitation from **Workspace members**. Real accounts do not use the demo credentials or role switch. Login accepts email or username, restores valid cookie sessions, and reports incorrect credentials and connection failures. Logout revokes the server session and signs out other tabs while retaining saved exams. **User settings** supports password changes; **Forgot password** accepts a coordinator-issued reset code.

Earlier browser-saved exams can be reviewed and copied into the account workspace using **Your existing saved exams**. The original copies remain intact. Account workspace exams use their own storage namespace and do not appear automatically in offline demo mode. See [the account guide](../docs/accounts.md) for recovery and storage boundaries.

Workspace screens are split into `WorkspaceForm.tsx`, `Members.tsx` and `UserSettings.tsx`; their public exports are in `src/pages/workspace/index.ts`. Shared account controls live under `src/components/auth/`, and session handling under `src/auth/`. `npm run test:e2e:auth` verifies the real account flow with a disposable database.

### Expression-output grouping

Open an **Expression output** question overview (Questions 1–9 in the bundled Sample exam) to see **Answer groups**. Identical outputs share a chart group and can receive one confirmed rubric mark. All spaces, quotes, case and line breaks are preserved, so outputs with different contents stay separate. Short-answer grouping retains its approved whitespace rules.

### Sample question checks

Open a student marking page to see **Answer checks and test results**. **Check original answer** checks outputs/traces; **Run original tests** checks assignment statements, missing lines and functions. The sample has 117 checks for 27 questions and human-review checklists for 10 questions that need prose/context or are missing multiple-choice options. Original answers and marks remain unchanged. See [coverage and source discrepancies](../docs/sample-test-coverage.md).

## New laptop setup

Double-click `Setup-macOS.command` or `Setup-Windows.cmd` in the project root to install the runtime and dependencies and open the app. The local demo or a coordinator can download the model from **Local AI setup** on the dashboard or in **User settings**. The panel shows byte progress, pause/resume, retry, file verification and loading. See [setup guide](../setup/README.md).
