# Presentation mode

Run `npm run dev:demo` from `frontend`, then select **Explore demo workspace**.
Only Vite starts; Python, Docker, a database server and AI models are not required.

- Demo API requests are handled by `transport.ts`; signed-in accounts keep the real API transport.
- Exam snapshots (including files, rubric edits and marks) are saved in a separate IndexedDB database, `automarktic-presentation-v1`.
- CSV previews parse the selected Canvas file in the browser. Grouping uses exact answer matching.
- Document import uses the bundled sample rubric draft; Word preview uses the bundled sample PDF. Use the supplied rubric for the presentation. This is not arbitrary DOCX conversion or extraction.
- Test outputs are fixed examples based on the bundled case inputs, not execution of the submitted code. They never assign marks automatically.
- AI review returns a preset review message; no model inference runs.
- Browser data is local to that browser. Demo roles do not confer real account permissions or demonstrate multiuser synchronization.

Run `npx playwright test --config config/playwright/demo.ts` for browser tests that reject every backend request, and `npm test` for unit tests.
