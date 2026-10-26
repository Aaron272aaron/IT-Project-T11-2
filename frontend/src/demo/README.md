# Presentation mode

Run `npm run dev:demo` from `frontend`, then select **Explore demo workspace**.
This command starts only Vite. The merged development branch also requires Python for Final 2026 storage and real test/AI endpoints; use the full development launcher for those features.

- Demo API requests normally use `transport.ts`; Final 2026 storage and the configured test/AI endpoints use the real backend. Signed-in accounts keep the real API transport.
- Except for Final 2026, which uses SQLite through `examStorage.ts`, exam snapshots, rubric edits, marks, profile changes and role selection are temporary. Refreshing resets the presentation to the initial Coordinator dashboard. Normal page navigation retains the current presentation. Old demo browser storage is retired; signed-in account storage is unchanged.
- CSV previews parse the selected Canvas file in the browser. Grouping uses exact answer matching.
- Document import uses the bundled sample rubric draft; Word preview uses the bundled sample PDF. Use the supplied rubric for the presentation. This is not arbitrary DOCX conversion or extraction.
- Test requests use the backend runner. Final 2026 AI corrections use the backend; other demo fixes remain presentation examples. These results never assign marks automatically.
- Local AI availability depends on backend configuration; the frontend does not load a model itself.
- Browser data is local to that browser. Demo roles do not confer real account permissions or demonstrate multiuser synchronization.

Run `npm test` for unit tests. The existing `demo-offline.spec.ts` suite assumes fully offline transport; it does not validate this branch's newly introduced backend-connected demo workflow.
