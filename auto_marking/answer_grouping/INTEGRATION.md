# Answer grouping integration

Source of truth: [Confluence Requirements Document, FR2 and QR2.2/QR2.4](https://jessiejosephjeyasingh.atlassian.net/wiki/spaces/CJM1P/pages/2261177/Requirements+Document), [User Stories, Epic 2](https://jessiejosephjeyasingh.atlassian.net/wiki/spaces/CJM1P/pages/3407984/User+Stories), and [Visual Style Standards, Charts](https://jessiejosephjeyasingh.atlassian.net/wiki/spaces/CJM1P/pages/4358192/Visual+Style+Standards). Read on 9 October 2026.

| Requirement | Implemented behavior |
| --- | --- |
| FR2.1 / story 2A | Short-answer responses differing only in ASCII spaces group together, including plain language that is not Python. Case, punctuation, tabs and line breaks remain significant. Original submissions are immutable. |
| FR2.2 / story 2B | Bar height represents group size. Exact counts, chart title and axes are visible. Keyboard-selectable bars open the original answer and student membership. Every original can be inspected or marked individually. Charts and membership lists paginate at 50 entries. |
| FR2.3 / story 2C | Tutors can select supported Unicode-space replacements, review their effect, and explicitly approve regrouping. No punctuation-removal rules are available. Regrouping does not change saved marks. |
| FR2.4–FR2.5 / story 2D | One confirmed category applies atomically to every selected group member, with an affected-student count. Existing individual marks trigger a replacement warning. Individual overrides remain available. |
| QR2.2 | Compact group membership snapshots, approved rules, marks and group-mark history persist with the exam in local browser storage. Cached groups restore without the grouping API if the original responses and rules still match. |
| QR2.4 | No fuzzy or semantic clustering. Original whitespace variants are flagged for human review. Incomplete, duplicated, stale or mismatched membership is rejected before marking. |
| QR3.2 / QR4.2 | Python grouping and browser mark application are tested with 10,000 synthetic submissions. The browser navigation test uses 1,001 submissions. |

## Data flow

`frontend/src/components/marking/AnswerGroups.tsx` calls `POST /api/answer-groups`. `backend/api/grouping.py` validates the request and uses `mode="spaces"` for short answers and `mode="exact"` for expression outputs through `auto_marking.answer_grouping.handle_grouping_request`. The browser verifies that every response appears exactly once with its original contents before persisting the result.

The Python module's original syntax-aware mode remains the default for direct Python callers. The UI exposes grouping for **Short answer** and **Expression output** questions. Expression-output support was added at the user’s request on 9 October 2026: only identical original outputs group together. Spaces (including Unicode spaces), quotes, case, numbers and line breaks remain significant; Unicode preprocessing controls are hidden for outputs. The same chart, member review, confirmed group marks and individual overrides apply. Saved-group signatures include the question type, so reclassifying a question rebuilds its membership without changing marks. Function/code questions remain in their existing review workflows.

Group marks use `frontend/src/utils/answerGrouping.ts` and the same category/range validation as individual marks. The complete membership is rechecked against current answers before one exam save. Group-mark history records the marker display name, timestamp, affected student IDs, previous scores, new score, category and comment. In real account mode, the marker profile is associated with a verified local account. Offline demo mode retains its sample identities.

## Current boundary

Saved exams are durable in the same browser and origin, with a session-storage mirror for existing integrations. Clearing browser data removes them. Local account authentication and backend role checks are now connected. This integration does not connect the separate PostgreSQL exam database, synchronize exam data between different browsers, implement multi-user locks, or provide automatic backups. Those project requirements remain separate work; local saves are not database transactions.

## Verification

From the project root:

```bash
python3 -m unittest discover -s backend/tests -p 'test_*.py'
```

From `frontend/`:

```bash
npm run test
npm run build
npm run test:e2e:grouping
npm run test:e2e:sample
```

Grouping browser checks start the real API with Docker and model preload disabled and use only synthetic student data.
