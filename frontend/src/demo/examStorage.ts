import type { ExamRegistry } from "../models/exams";
export const DATABASE_EXAM_ID = "7e76b890-ee27-40b6-933f-94569e39ca25";
type Snapshot = { registry: ExamRegistry; revision: number };
type Store = (value?: Snapshot) => Promise<Snapshot>;
let serverSnapshot: Snapshot | undefined;

export function splitExams(registry: ExamRegistry) {
  const browser: ExamRegistry = {}, database: ExamRegistry = {};
  for (const [workspace, exams] of Object.entries(registry)) {
    browser[workspace] = exams.filter(e => e.id !== DATABASE_EXAM_ID);
    const selected = exams.filter(e => e.id === DATABASE_EXAM_ID);
    if (selected.length) database[workspace] = selected;
  }
  return { browser, database };
}
async function request(value?: Snapshot): Promise<Snapshot> {
  const response = await fetch("/api/exams", {
    method: value ? "POST" : "GET",
    headers: { "X-App-Request": "AutoMarktic", "X-Automarktic-Demo": "1", "Content-Type": "application/json" },
    credentials: "same-origin", cache: "no-store",
    ...(value ? { body: JSON.stringify(value) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "Could not save Final 2026. Check the backend and refresh.");
  return value ? { registry: value.registry, revision: result.revision } : result;
}

let loading: Promise<Snapshot> | undefined;
export async function loadMixedExams(store: Store): Promise<Snapshot> {
  if (!loading) loading = loadSnapshot(store).finally(() => { loading = undefined; });
  return structuredClone(await loading);
}
async function loadSnapshot(store: Store): Promise<Snapshot> {
  const local = await store();
  let remote = await request();
  let selected = splitExams(remote.registry).database;
  if (!Object.values(selected).some(items => items.length)) {
    selected = structuredClone(splitExams(local.registry).database);
    for (const exams of Object.values(selected)) for (const exam of exams) exam.title = "Final 2026";
    if (Object.keys(selected).length) {
      // Preserve unrelated database records; only this ID is connected to the demo.
      const registry = structuredClone(remote.registry);
      for (const [workspace, exams] of Object.entries(selected)) registry[workspace] = [...(registry[workspace] ?? []), ...exams];
      remote = await request({ registry, revision: remote.revision });
    }
  }
  serverSnapshot = structuredClone(remote);
  const registry = splitExams(local.registry).browser;
  for (const [workspace, exams] of Object.entries(selected)) registry[workspace] = [...(registry[workspace] ?? []), ...exams];
  return { registry, revision: local.revision };
}

export async function saveMixedExams(store: Store, next: Snapshot): Promise<number> {
  const local = await store();
  if (local.revision !== next.revision) throw new Error("This demo changed in another tab. Refresh before saving.");
  if (!serverSnapshot) throw new Error("Wait for Final 2026 to load before saving.");
  const split = splitExams(next.registry);
  const previous = splitExams(serverSnapshot.registry).database;
  if (JSON.stringify(previous) !== JSON.stringify(split.database)) {
    const registry = splitExams(serverSnapshot.registry).browser;
    for (const [workspace, exams] of Object.entries(split.database)) registry[workspace] = [...(registry[workspace] ?? []), ...exams];
    serverSnapshot = structuredClone(await request({ registry, revision: serverSnapshot.revision }));
  }
  // Keep the old browser copy as an untouched recovery record, never as live data.
  const registry = split.browser;
  for (const [workspace, exams] of Object.entries(splitExams(local.registry).database)) registry[workspace] = [...(registry[workspace] ?? []), ...exams];
  await store({ registry, revision: local.revision + 1 });
  return local.revision + 1;
}

export function isDatabaseReviewKey(key: string): boolean {
  try {
    const parts = JSON.parse(key);
    return Array.isArray(parts) && typeof parts[1] === "string" && parts[1].startsWith(`${DATABASE_EXAM_ID}/`);
  } catch { return false; }
}
