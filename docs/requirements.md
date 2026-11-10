# AutoMarktic — Requirements

## Source and version control

Prepared 9 November 2026. Implementation baseline: local `IT-Project-API`, branch `fixing`, commit `cc5cb46`. The account database has local runtime changes and is not part of this documentation baseline. This document is a reviewable consolidation, not evidence that all requirements have passed acceptance testing.

- [Requirements Document](https://jessiejosephjeyasingh.atlassian.net/wiki/spaces/CJM1P/pages/2261177/Requirements+Document), page displayed “Edited Oct 24”.
- [User Stories](https://jessiejosephjeyasingh.atlassian.net/wiki/spaces/CJM1P/pages/3407984/User+Stories), Epics 1–9.
- [Architecture Goals and Constraints](https://jessiejosephjeyasingh.atlassian.net/wiki/spaces/CJM1P/pages/7143558/Architecture+Goals+and+Constraints), AG1–AG8 and AC1–AC13.
- [System Architecture Design Model](https://jessiejosephjeyasingh.atlassian.net/wiki/spaces/CJM1P/pages/3965008/System+Architecture+Design+Model), Version 1 PDF, 5 September 2026; attachment preview inspected.
- [System Diagram](https://jessiejosephjeyasingh.atlassian.net/wiki/spaces/CJM1P/pages/7209370/System+Diagram), Version 2 PDF, 3 September 2026; attachment preview inspected.

The Confluence pages were read, not intentionally edited. Local source extracts and diagram screenshots are retained in `sources/`. Requirements express intended behaviour; implementation notes describe the inspected code. Proposed changes require team/client agreement and do not silently replace the source baseline.

## 1. Purpose, stakeholders and scope

AutoMarktic is a locally hosted, AI-assisted programming-exam marking application. Coordinators prepare exams, import Canvas CSV submissions, configure question types and rubrics, and monitor progress. Tutors review individual or grouped answers, consult test and AI evidence, and confirm marks. Students are the subjects of assessment, not an implemented application login role. The host operator installs dependencies, manages the local model and maintains backups.

Original submissions must remain unchanged. Imported source scores, automated evidence, proposed code and human-confirmed marks have different meanings and must remain distinguishable. The shared host stores production data; tutor browsers need access to that same host. Separate localhost installations do not share a workspace.

The baseline covers Python, CSV import/export, seven question types, local inference, human marking, concurrent access and recovery. Direct Canvas API retrieval and additional programming languages are future extensions. The public client demo is a separate simulated product walkthrough, not a substitute for acceptance of the real backend.

## 2. Reading this document

- **Source baseline:** Sections 3–4 reproduce all source FR/QR rows, preserving IDs and priorities. Spacing is normalized for Markdown; the wording has not been silently reduced to match current limitations.
- **Proposed clarification:** Section 5 resolves ambiguities for team/client review. A proposal is not an approved scope change.
- **Supplementary requirements:** Section 6 consolidates features in the User Stories and later requested changes that have no complete FR counterpart. `SUP-*` and `AT-*` are local documentation IDs, not original Confluence IDs.
- **Implementation status:** Section 7 separates code that exists from acceptance that remains outstanding. “Implemented” does not imply every quality target has been met.
- **Normative language:** Must/shall indicates a required outcome; should indicates a preferred outcome. The source uses “Essential / Medium” and some unspecified priorities; these are retained rather than silently re-ranked.

## 3. Functional requirements — source baseline

### FR 1: Submission processing

| ID | Feature | Requirement | Source priority |
| --- | --- | --- | --- |
| FR1.1 | Importing students' submissions | The system must allow the subject coordinator (1 user) to import student submissions from Canvas-exported CSV files (up to 10,000 rows). | Essential / High |
| FR1.2 | Parsing Data | The system must parse student IDs, question numbers, and answer data correctly (including answers containing spaces, line breaks, indentation, or code formatting). | Essential / High |
| FR1.3 | Detect incomplete data | The system must detect malformed, incomplete, in valid or corrupted CSV rows and report them to the subject coordinator. <br><br>The system must handle non-standard Unicode whitespace characters using configured pre-processing rules where appropriate. | Essential / High |
| FR1.4 | Handle Whitespace | The system must preserve the original imported answer exactly. Any approved normalisation must be applied only to a separate comparison representation used for grouping. | Essential / High |
| FR1.5 | Storing submissions | Store imported submissions of each exam (up to 10,000 submissions) for marking purposes (including student ID, questions, answers, marking status, and final marks) in the database. | Essential / High |
| FR1.6 | Canvas Integration | The system could support automated retrieval of submissions through Canvas APIs and modify their format for parsing into the database in future versions. | Optional / Low |

### FR 2: Answer grouping

| ID | Feature | Requirement | Source priority |
| --- | --- | --- | --- |
| FR2.1 | Exact Match Grouping | The system must identify and group identical short-answer responses together for short-answer questions.<br><br>Answers are considered identical if they differ only in spaces. | Essential / High |
| FR2.2 | Group View | The system must display an overview of all answer groups to the marker in a bar graph. Higher bar means more students in that group. <br><br>If the tutor clicks on a specific answer group, they can see the answer text, the number of students in the group, and the students belonging to that group | Essential / High |
| FR2.3 | Manual Configuration | The system should allow tutors to manually configure pre-processing rules to handle non-ASCII unicode characters. The system must not remove punctuation or other meaningful characters unless explicitly configured and approved. | Optional |
| FR2.4 | Marking | The system must allow markers to assign marks to an answer group or individual student in one step. | Essential / High |
| FR2.5 | Marking | Once the tutor assigns a mark to a group answer, that mark is applied to all students within that selected group. | Essential / High |

### FR 3: Automatic test cases

| ID | Feature | Requirement | Source priority |
| --- | --- | --- | --- |
| FR3.1 | Running test cases | The system must execute student Python submissions against predefined test cases with pre-defined time and memory limitations in the rubric in an isolated environment such as a docker container. | Essential / High |
| FR3.4 | Variation | Automated tests must evaluate observable behaviour rather than require the submitted code to match a reference implementation. Required function names, parameters, and interfaces must still be respected. | Essential / High |
| FR3.2 | Storing results | The system must record all test outcomes for each student's answers in the database for later review if needed. | Essential / High |
| FR3.3 | Full-Marks Recommendation | The system should recommend full marks for submissions passing all required tests to the tutors, but must not assign the marks automatically to the students. | Essential / Medium |

### FR 4: AI-assisted function marking

| ID | Feature | Requirement | Source priority |
| --- | --- | --- | --- |
| FR4.1 | Flagging | The system must detect submissions that fail to compile or run and forward them to a locally hosted LLM, Qwen2.5 coder 7B BF16, to generate a minimal fix. | Essential / High |
| FR4.2 | Generate Minimum Fixes | The system must request local LLM to propose the minimum code modification required for the code to be compiled and run successfully. The system must then run the modified code against the same predefined tests and display the result to the tutor. This process should happen upon the creation of the exam. | Essential / High |
| FR4.3 | Present Changes | AI corrections must remain separate from the original submission. Tutors must be able to review the changes, compare available test evidence, and request regeneration without changing the original answer or automatically changing a confirmed mark. | Essential / High |
| FR4.4 | Explain Changes | The system should display concise one-sentence explanations for suggested modifications. | Optional / Low |
| FR4.5 | Re-running test cases | The system must show test case results of both the student's original code and  the AI-corrected code side by side. | Essential / High |
| FR 4.6 | Re-running AI suggestions | The system should allow the tutor to regenerate AI suggestions. | Optional / Medium |
| FR4.7 | Human Approval | Only authorised human markers, including tutors and subject coordinators with marking permission, may confirm final marks. | Essential / High |
| FR4.8 | Storing recommendations | AI suggestions and associated test results must be retained according to the agreed data-retention policy and linked to the relevant submission and review history. | Essential / High |
| FR4.9 | Local LLM only | The LLM must be run locally. The system must not call third-party hosted AI services such as ChatGPT, Claude, Gemini, or other external AI APIs. | Essential / High |

### FR 5: Marking functions

| ID | Feature | Requirement | Source priority |
| --- | --- | --- | --- |
| FR5.1 | Interface | The system must provide a graphical interface for tutors and markers. | Essential / High |
| FR5.2 | Question types | The system must support seven initial question types: <br><br>Expression output<br><br>Single assignment statement<br><br>Multiple choice<br><br>Code completion<br><br>Debugging<br><br>Coding questions<br><br>Short answer | Essential / High |
| FR5.3 | Review | The system must provide a hierarchical review interface with three navigation levels. Level 1 lists all exam questions with marking progress. Selecting a question opens Level 2, listing that question's student answers (individually or grouped by identical/similar code) with mark status. Selecting an answer opens Level 3, which displays the question text, the student's submitted code, test case results for the original code, the AI-recommended correction as a minimal changeset with its own test case results, and the mark assigned to that answer. The marker must be able to navigate back up at any level. | Essential / High |
| FR5.4 | Manual Marking | The system must allow tutor to manually mark at any point. All final marks should be decided by human marker. | Essential / High |
| FR5.5 | Rubric View | The system must display rubric options when tutors mark the exam | Essential / High |
| FR5.6 | Record Marking | The system must record and save all marking progress automatically for each student and question (so tutor can stop and resume). Saving the progress should not take longer than 1s. | Essential / High |

### FR 6: Concurrent marking

| ID | Feature | Requirement | Source priority |
| --- | --- | --- | --- |
| FR6.1 | Multiple markers condition | The system must support multiple tutors working on the same marking project at the same time. Each tutor may open any student's answer for any question. | Essential / High |
| FR6.2 | Locking | When one tutor is working on one submission from a student, the system must lock that question submission to prevent other tutors from accessing it at the same time. | Essential / High |
| FR6.3 | Race Condition | The system must ensure that final marks and marking status are saved without race conditions. | Essential / High |
| FR6.4 | Review | The system should allow tutors to view the mark assigned to a submission marked by another tutor | Optional / Medium |
| FR6.5 | Record | The system should record which tutor marked or modified each student's answer, including timestamp, marks and marking status changes. | Optional / Medium |

### FR 7: Result export

| ID | Feature | Requirement | Source priority |
| --- | --- | --- | --- |
| FR7.1 | Export Marks | The system must allow the marker to export recorded final marks as a CSV file. | Essential / High |
| FR7.2 | Export Format | For every student in the marking, Exported data must contain:<br><br>Student ID number<br><br>Marks for each student’s questions / subquestions The recorded mark for each question and subquestion<br><br>Total marks for each student | Essential / High |

## 4. Quality requirements — source baseline

### QR 1: Security, privacy and compliance

| ID | Requirement | Source priority |
| --- | --- | --- |
| QR1.1 | The system must not send student submissions, student identifier, marks, rubric information, testing results to external third-party AI services. AI processing must be performed by the locally deployed model. | Essential / High |
| QR1.2 | Production marking data must be stored on the authorised local host, such as the coordinator’s device or an approved local server. Authorised tutors access the shared marking workspace through a browser.<br><br>Within the application, marking data must only be accessible to authorised Tutor and Subject Coordinator. | Essential / High |
| QR1.3 | The system must maintain an auditable history of marking decisions (who associated students and questions/when date and time of the change), including test results and AI suggestions. | Essential / High |

### QR 2: Reliability

| ID | Requirement | Source priority |
| --- | --- | --- |
| QR2.1 | The system should detect a CSV file that cannot be analyzed and or is missing the required columns, reject the import malformed or messy CSV data gracefully, including spacing, indentation, and formatting issues. (display the import error to the markers maybe) | Essential / High |
| QR2.2 | The system must preserve marking progress between sessions. <br><br>After a maker saves a marking progress and closes the application, the system must restore the saved marks, marking status, answer groups, test results, and recorded AI decisions when the same marking session is reopened. | Essential / High |
| QR2.3 | The system must not automatically finalise a student's mark from test results or AI output where final marks are decided and confirmed by human tutors/markers. | Essential / High |
| QR2.4 | Risk-averse grouping. The system must prioritise avoiding incorrect groupings over maximising efficiency. The answers that cannot be identified in the same group must remain separate and waiting for markers to review. | Essential / High |
| QR 2.5 | The system must automatically back up all marking data at regular intervals while marking is in progress. Backups must include marking progress, final marks, comments, answer groups, test results, AI suggestions, and audit logs. <br><br>The coordinator must be able to restore the system from a valid backup if the application crashes, the database becomes corrupted, or the server fails. | Essential / High |

### QR 3: Usability

| ID | Requirement | Source priority |
| --- | --- | --- |
| QR3.1 | Tutors should be able to use the system without developer assistance after a short onboarding guide. | Essential / High |
| QR3.2 | The interface should support efficient review of large numbers of submissions (over 1000). With a required marking dataset containing more than 1,000 student submissions, the system must allow marker to open the submission list, select a student submission, and access its marking information without interface failure. | Essential / High |
| QR3.3 | The system should clearly distinguish between automated test results, AI-generated suggestions, and human marker decisions. with distinct source labels that each type of information can be distinguished from others. | Essential / High |

### QR 4: Performance

| ID | Requirement | Source priority |
| --- | --- | --- |
| QR4.1 | The system must allow submission analysis and test execution to be performed as a batch process without requiring the marker to manually initiate processing for each individual submission. | Essential / High |
| QR4.2 | The system must support batch processing of large cohorts. The system must be able to process a marking batch containing more than 1,000 student submissions without requiring the batch to be manually divided into smaller batches. | Essential / High |
| QR4.3 | Tutor must only require a modern web browser and network access to the marking interface .<br><br>The local LLM and database must be able to run coordinator’s device. | Essential / High |
| QR4.4 | The selected local LLM and runtime should be chosen based on the available hardware, including Chris’s GPU or the marker machine’s capabilities. | Optional / Medium |

### QR 5: Maintainability and extensibility

| ID | Requirement | Source priority |
| --- | --- | --- |
| QR5.1 | The system should be structured so that question types, rubrics, and test cases can be updated without redesigning the whole application. not require changes to the processing logic of existing. | Optional / Low |
| QR5.2 | Additional programming languages should be supportable in future versions without changing the marking logic for already supported languages. | Optional / Low |
| QR5.3 | Rubrics and test cases should be configurable.<br><br>Rubrics and test cases must be stored separately from student submissions and executable marking logic so that they can be replaced for a question without modifying the initial code. | Optional / Low |

## 5. Clarifications requiring agreement

| Reference | Conflict or ambiguity | Proposed acceptance wording / decision |
| --- | --- | --- |
| FR1.1; US1A/1C | Import story occasionally names Tutor although Coordinator is the actor | Only an authorized Coordinator imports/replaces exam answers; Tutors can review stored answers. Keep the 10,000-row requirement until explicitly renegotiated. |
| FR1.3–1.4; QR2.1 | “Handle whitespace” could imply modifying code | Preserve original answer text; approved normalization applies only to a separate grouping key. Reject missing required structure; distinguish blocking issues from review warnings and legitimately blank answers. |
| FR2.1; US2A/2C | “Identical” and “similar” are mixed | Short-answer equality ignores ordinary ASCII spaces under the current default rule; Unicode rules require review. No semantic equivalence is implied. Expression-output answers use exact matching. Confirm whether spaces-only matching is academically appropriate per question. |
| FR3.1 | Limits described as being “in the rubric” | Limits and execution suites are host/test configuration. Importing a Word rubric does not generate executable test cases or resource policies. If rubric-editable limits are required, retain this as additional work. |
| FR3.3; US3C | Passing tests versus awarding full marks | Highlight a candidate for review; never create a final mark automatically. Define where the indicator must appear, including submission lists. |
| FR4.1–4.2; US3B/4A | “Fails to build,” “runs successfully,” and “fails tests” differ | Start preparation when nonblank Coding answers are available and classified. Run original tests first. Skip repair when all pass. For completed failing runs, attempt supported syntax repair. Missing suites/infrastructure failures are retryable service issues, not failed student tests. Logical repair beyond syntax remains an explicit scope decision. |
| FR4.1; AC2 | Source mandates Qwen2.5-Coder 7B BF16 | Record the implemented pinned `ZhixinYin/qwen2.5-coder-syntax-repair` checkpoint separately. Obtain agreement before replacing the model requirement; do not claim the current deployment meets the named 7B BF16 target. |
| FR4.2 | “Upon creation” may occur before answers exist | Trigger when uploaded answers, Coding classification and required dependencies are available. Blank exam creation alone cannot generate fixes. |
| FR4.2/4.5; US4E | Required corrected-code tests are automatic and side by side | Retain this requirement as a gap: current corrected-code execution is button-triggered, with original evidence on the marking page and recommendation evidence in its dialog. Do not call it a completed automatic pipeline. |
| FR4.8; AG1; QR1.3/2.2 | Retention versus delete-on-completion; AI decisions versus cached suggestions | Agree retention period, completion trigger, permitted deletion, backup retention and audit requirements. Persisted suggestion cache is not a versioned history of acceptance/rejection. |
| FR5.3; AG7 | Seven types versus three conceptual categories; “similar code” | Use the seven named types in FR5.2. The three architecture categories are high-level processing paths. Do not promise similarity-based code grouping. |
| FR5.6; US5E | Auto-save may mean saving drafts without confirmation | Human confirmation commits a mark; successful saved marks/comments must survive restart. Define separately whether unconfirmed form drafts must survive closing. The ≤1 second target still needs a defined workload and measurement. |
| FR6.2; US7E | Requirement prohibits access; story permits read-only | Prevent conflicting edits, while allowing authorized users to read a locked answer. Acquire/renew/release leases; stale saves must not overwrite newer work. |
| FR6.1/6.3; US7E | Independent edits expected to save concurrently | Snapshot-level revision conflicts may require reload/retry even for different answers. Agree whether this workflow is acceptable or require finer-grained updates. |
| FR7.1; US6A | “Marker” export versus Coordinator export | Confirm export permissions. The proposed default is Coordinator export of confirmed results with per-question marks, totals, generation time and explicit incomplete-record handling. |
| QR1.2; US7A–7C | Role access versus workspace/team assignment | Define backend membership and exam permissions. A role selector or browser member list must not grant access. Current installation-wide account scope does not fulfill fine-grained membership. |
| US8E/8F | Deleting options versus updating linked marks | Retained option score changes update linked marks after preview/confirmation. For deleted options, agree reassignment or explicit review; current code keeps saved marks and does not enforce resolution before removal. |
| QR4.1–4.2; AG5 | Batch operation and independence from browser | Decide whether closing the browser must allow completion. Current queue stops scheduling on close; durable server-side scheduling is additional work. Keep large-cohort acceptance outstanding. |

## 6. Supplementary requirements and acceptance scenarios

These consolidate the user stories and later approved interaction requests. They supplement, rather than replace, the source baseline.

### SUP-01 — Accounts, roles and recovery (US7A, US7C)

Provide verified Coordinator and Tutor sessions, invitation-based registration after first-account setup, logout, password changes and time-limited single-use recovery codes. Recovery codes must be account-bound and issued only by an authorized coordinator; code delivery is manual, not automated email.

- Success: valid credentials establish a session with the assigned role; an authorized recovery code changes the intended account password and cannot be reused.
- Failure: invalid credentials, expired/reused/wrong-account codes and unauthorized operations are rejected without changing credentials or exposing account existence through login errors.

### SUP-02 — Workspace and team access (US7B)

Coordinators manage workspace membership and permitted exams. Removing membership revokes access to protected data and writes while preserving historical attribution.

- Success: a member sees only permitted exams; revocation applies to later API requests, not just navigation visibility.
- Failure: duplicate/ineligible additions and requests outside membership are rejected.
- Current limitation: this is not implemented by installation-wide role checks alone.

### SUP-03 — Profile and avatar (US7D)

Provide a default initials avatar and optional supported image upload. Names and avatars should be consistent across profile, sidebar and membership views.

- Success: valid changes persist across the agreed account/device scope.
- Failure: unsupported or oversized images leave the prior avatar intact and display a useful message.
- Decision: confirm required cross-device persistence; current presentation settings are partly browser-local.

### SUP-04 — Exam creation and attachments (US8A, US8C)

Create an exam with a valid name and optional DOCX/PDF rubric. Answer CSV belongs to its selected exam. Rubric documents may be added or replaced later without replacing original answers or marks.

- Success: exam without rubric appears in the correct workspace; subsequent valid uploads are attached to that exam.
- Failure: empty name, unsupported/unreadable/oversized document or save failure does not corrupt existing exam state; entered form data remains available where supported.

### SUP-05 — Editable rubric generation (US8D, US8E)

Parse the supported document template into proposed sections, question associations, scores and descriptions. Review associations before applying the draft. Only confirmation activates changes. Merge equal-score descriptions into one displayed score option, preserving their meaning.

- Success: Coordinator can inspect source text, correct question mappings, add/edit/remove options and save a valid per-question rubric.
- Failure: unreadable/scanned PDF or unsupported structure explains the failure and leaves active rubric/marks unchanged; ambiguous/unmatched sections remain for manual review. Duplicate or out-of-range question associations are rejected.

### SUP-06 — Question type assignment and Coding suggestion (US8B; 9 November change)

Support seven types and Unassigned. For the standard Part 6 Python-functions rubric section, suggest Coding for associated unassigned questions. Coordinator confirms the associations and rubric changes before types become active. Preserve existing assigned types; do not use the unreliable syntax-model classification experiment.

- Success: supplied guide suggests Q32–Q34; edited associations determine the actual target questions; saved types appear in the selector and control the marking tools.
- Failure: nonmatching headings do not suggest Coding; invalid associations prevent application; discarded drafts do not change saved types; manually assigned types remain unchanged.

### SUP-07 — Rubric score amendments (US8F)

Preview affected confirmed responses when a linked option changes score. Require a reason where confirmed marks are affected. Save rubric and linked mark changes atomically, update totals, and record actor/time/before/after history.

- Success: every response linked to a retained changed option receives the new score after confirmation.
- Failure: a conflict or failed save leaves authoritative data unchanged and must not be reported as successful. Deleted-option handling remains subject to the decision in Section 5.

### SUP-08 — Marking workflow and history (US4F, US5A–5E, FR6.5)

Provide exam → question → response navigation, original response, relevant evidence, rubric choice, optional comment, explicit confirmation and amendment history. Display mark decision separately from test/AI evidence.

- Success: valid mark/comment saves, reloads and appears against the correct student/question; subsequent changes record authenticated actor and before/after values.
- Failure: invalid marks, authorization/lock/revision conflicts and failed writes explain the problem without claiming success. History cannot reconstruct changes predating audit implementation.

### SUP-09 — Background AI preparation (US4G)

Queue eligible nonblank Coding answers, show progress, support pause/resume and retry, and reuse matching completed evidence/reviews. Preserve originals and confirmed marks. A service failure must not be represented as an academically incorrect answer.

- Success: fully passing original code skips repair; failing supported code receives a separate recommendation; marker may continue other work while preparation runs.
- Failure: missing suite/model, timeout or unsuccessful generation is explicit and retryable. Manual marking remains possible while API is available. A fatal in-process model crash currently requires server restart.

### SUP-10 — Dashboard (US5G)

Show exam/student counts, confirmed marking progress and result distribution, keeping pending students distinct from completed results.

- Success: changing confirmed marks updates relevant summaries; incomplete marking is visibly pending.
- Failure: unavailable records must not be silently presented as genuine zero marks or completed marking.

### SUP-11 — Backups and recovery (US5F; QR2.5)

Create consistent paired account/exam snapshots, validate restores, retain a safety copy, and recover from partial restoration failure. Restrict restore to a stopped server and invalidate old sessions/leases afterward.

- Success: restore recovers saved exams, marks, comments, groups, persisted test evidence, AI cache and audit events.
- Failure: corrupt/incomplete backup or live-server restore is rejected before replacing data. Failure replacing either database rolls back the pair. No valid backup must be reported as unrecoverable, not as successful recovery.
- Current policy: daily when due, hourly checks, seven automatic snapshots; host operator must manage off-device copies. Confirm whether this recovery-point objective meets client needs.

### SUP-12 — Public demonstration (US9A)

Provide a public, account-free walkthrough using production-style layouts and clearly identified synthetic/simulated data. Public demo changes reset on refresh and must not contact the production marking backend.

- Success: client can explore coordinator/tutor workflows and use example data without Python/model installation.
- Failure: missing assets show loading/retry information, not a hidden fallback to production APIs.
- Deployment is separate from the local application's release; the latest requested deployment is paused at the user's instruction.

## 7. Implementation and evidence matrix

| Scope | Current assessment | Evidence / outstanding work |
| --- | --- | --- |
| FR1.1–FR1.5 | Implemented core; capacity unverified | Python preview/validation, preserved answers, SQLite registry. 10 MiB CSV limit is not proof of 10,000-row acceptance. |
| FR1.6 | Future | No direct Canvas API import claimed. |
| FR2.1–FR2.5 | Implemented supported rules | Short-answer UI now connected, exact expression matching, Unicode configuration, human group marks; no semantic matching. |
| FR3.1/3.2/3.4 | Implemented core | Restricted Docker execution; persisted versioned evidence; configured suites. Student-associated exhaustive historical reporting still requires acceptance review. |
| FR3.3 | Acceptance outstanding | Passing results are displayed; verify the required full-mark candidate highlighting at submission-list level. |
| FR4.1–FR4.2 | Partial / scope mismatch | Local pinned syntax repair, failed-original-test gate; no general logic repair; corrected tests are manual; source model specification differs. |
| FR4.3/4.6/4.7/4.9 | Implemented core | Separate code/diff, regeneration, human confirmation, local inference. |
| FR4.4 | Partial / optional | Syntax issue/status and diff exist; a dedicated generated one-sentence explanation and coordinator toggle are not established. |
| FR4.5 | Partial | Both variants can be tested; automatic side-by-side test evidence requirement not fully met. |
| FR4.8; QR1.3 | Partial | Completed review cache, test evidence and mark audit persist; full versioned AI decisions and agreed retention/deletion policy do not. |
| FR5.1–FR5.5 | Implemented core | Seven types, three-level marking, rubric and human decision controls; review exact per-list progress requirements. |
| FR5.6; QR2.2 | Partial | Confirmed saves persist; ≤1-second latency and unsaved draft recovery are not established; AI reject history is not durable. |
| FR6.1–FR6.5 | Implemented mechanisms; limits | Leases, revision checks, per-mark history. Shared scope can cause conflicts on different answers; universal lease enforcement and 10-user load acceptance remain outstanding. |
| FR7.1–FR7.2 | Integration gap | Legacy export exists; current uploaded-exam `exam.marks` route lacks equivalent verified export with totals/round-trip compatibility. |
| QR1.1–QR1.2 | Core local processing; partial access scope | No hosted inference; backend role checks. Fine-grained team/exam membership is incomplete. Disable optional demo API for restricted production use. |
| QR2.1/2.3/2.4 | Implemented core | Validation, human-only final marks, conservative grouping; external hostile-input/security review not certified. |
| QR2.5 | Implemented with operational limits | Paired backup/restore and failure tests; no guaranteed off-device copy or recovery from host loss. |
| QR3.1–QR3.3 | Partial / acceptance outstanding | UI workflow and source labels; novice usability and >1,000-student navigation require recorded acceptance. |
| QR4.1–QR4.2 | Partial | Browser-driven queue for eligible Coding answers; no durable unattended scheduler or proven full-cohort throughput. |
| QR4.3–QR4.4 | Environment-dependent | Shared-host deployment needs proxy/network configuration; CPU demonstrated, MPS failure observed, target AMD acceptance outstanding. |
| QR5.1–QR5.3 | Partial extensibility | Modular components and external suites; new arbitrary questions need suite configuration, new languages need adapters, rubric import does not create tests. |
| SUP-01–SUP-12 | Mixed | Account/rubric/recovery mechanisms exist; team ACLs, profile synchronization and export gaps remain as stated above. |

## 8. Acceptance plan and traceability

The following are required checks, not a claim that they have all passed. Record commit, environment, input fixture, expected/actual results, test date and evidence for each execution.

| Test ID | Source coverage | Success / failure checks |
| --- | --- | --- |
| AT-01 CSV | FR1.1–1.5, QR2.1, US1A–1D | Import 100 and 10,000-row fixtures; correct student/question links; quoted multiline/Unicode text preserved; duplicates, missing headers, corrupt and oversized files; no partial silent replacement. |
| AT-02 Grouping | FR2.1–2.5, QR2.4, US2A–2D | Spaces-only equivalence, meaningful differences separate, Unicode preview, membership/count display, batch score confirmation, existing marks and active-lock conflicts. |
| AT-03 Execution | FR3.1/3.2/3.4, US3A–3B | Correct/incorrect implementations, syntax/runtime errors, infinite loops, resource limits, missing Docker/suite; restart restores matching evidence; changed code/suite invalidates reuse. |
| AT-04 AI | FR4.1–4.9, US4A–4G | Passing answers skip model; failed syntax example yields separate minimal diff; actual recommendation tests; failure/retry/pause; original marks unchanged; runtime outage distinguished from answer failure. |
| AT-05 Human marks | FR5.1–5.6, US5A–5E | Navigation, rubric/options, comments, mark amendment, out-of-range rejection, confirmation persistence, save failure, measured latency. |
| AT-06 Concurrency | FR6.1–6.5, US7E | Two real sessions on same/different answers; read-only lock, renewal/expiry/release, stale revision, direct API save without lease, group overlap, three and ten-user workloads. |
| AT-07 Export | FR7.1–7.2, US6A–6B | Uploaded-exam final marks exported with IDs/question marks/totals/time; incomplete records require confirmation; formula escaping; fresh CSV round-trip and exact comparison. |
| AT-08 Access/profile | QR1.2, US7A–7D | Invalid login, invitations/recovery, role restrictions, account isolation, team membership revocation, avatar validation and agreed persistence scope. |
| AT-09 Rubric | US8A–8F, SUP-04–07 | Optional document, PDF/DOCX validation, editable parsing, ambiguous sections, same-score merging, Coding suggestions, preserved manual types, batch amendments and atomic conflict rejection. |
| AT-10 Recovery | QR2.2/2.5, US5F | Restart persistence, valid restore, corrupt/missing snapshot rejection, rollback, live-server refusal, retention, revoked sessions/leases after restore. |
| AT-11 Scale/UI | QR3.1–3.3, QR4.1–4.4, AG4–5 | >1,000-submission navigation and whole-batch work; save p95/maximum under specified hardware and concurrency; onboarding without developer assistance. |
| AT-12 Demo | US9A | No real account/backend required; production-style layout, fixture loading/retry, refresh reset, synthetic data only, no production mutations. |

Existing evidence from this chat includes recovery/backend checks (139 backend tests), targeted browser checks (7 auth + 1 locking + 1 recovery), and 98 frontend tests after Coding classification. Builds passed. The real CPU syntax-repair walkthrough changed original 0/6 to corrected 6/6. These are bounded, dated observations, not proof that AT-01–AT-12 or every source requirement is complete. No full regression, performance or remote CI rerun was performed solely to author these documents.

## 9. Decisions needed before final sign-off

1. Approve model identity and syntax-only scope versus the original model/runtime requirement.
2. Resolve automatic corrected-code tests, unattended batch completion and full-mark highlighting.
3. Agree team/exam authorization boundaries and export role/schema; finish current-exam export acceptance.
4. Agree mark-draft save semantics, latency measurement conditions, cohort sizes and concurrent user workload.
5. Define retention/deletion rules for suggestions, decisions, audit events and backups; resolve AG1 versus FR4.8.
6. Agree option-deletion handling and stricter backend mark/lease validation requirements.
7. Verify clean installation on intended hosts and document CPU fallback and fatal inference failure limits.
8. Treat the public demo and production release as separate deliverables with separate verification.

## 10. Supporting documents

- [architecture.md](architecture.md): implemented components, data structures, flows, risks and differences from the original diagrams.
- Repository `docs/recovery.md`: backup/restore commands and persistence semantics.
- Repository `docs/accounts.md`: local account and sharing setup.
- Repository `docs/testing.md` and `.github/workflows/ci.yml`: test entry points and configured CI coverage.
- `sources/requirements-confluence.txt` and `sources/requirements-tables.json`: captured baseline.
- `sources/user-stories-confluence.txt`: full source success/failure scenarios for Epics 1–9.
