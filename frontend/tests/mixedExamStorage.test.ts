import type { ExamRegistry } from "../src/models/exams";
type Snapshot = { registry: ExamRegistry; revision: number };
import { afterEach, expect, it, vi } from "vitest";
import { DATABASE_EXAM_ID, loadMixedExams, saveMixedExams } from "../src/demo/examStorage";
afterEach(() => vi.unstubAllGlobals());
it("keeps browser edits local, persists only the selected exam, and rejects stale SQL writes", async () => {
  const selected = { id: DATABASE_EXAM_ID, title: "Sample exam (restored)", description: "preserve marks" };
  const other = { id: "final", title: "Sample exam", description: "browser" };
  let local: Snapshot = { registry: { c: [other, selected] }, revision: 4 };
  let remote: Snapshot = { registry: { c: [{ id: "old", title: "Old database exam", description: "untouched" }] }, revision: 2 };
  const store = vi.fn(async (value?: typeof local) => { if (value) local = value; return structuredClone(local); });
  const network = vi.fn(async (_: string, options: RequestInit) => {
    if (options.method === "POST") {
      const body = JSON.parse(options.body as string);
      if (body.revision !== remote.revision) return new Response(JSON.stringify({ message: "Refresh before saving" }), { status: 409 });
      remote = { registry: body.registry, revision: remote.revision + 1 };
      return new Response(JSON.stringify({ revision: remote.revision }));
    }
    return new Response(JSON.stringify(remote));
  });
  vi.stubGlobal("fetch", network);
  const loaded = await loadMixedExams(store);
  expect(loaded.registry.c.map(e => e.title)).toEqual(["Sample exam", "Final 2026"]);
  expect(remote.registry.c[0].title).toBe("Old database exam");
  expect(local.registry.c[1].title).toBe("Sample exam (restored)");
  network.mockClear();
  loaded.registry.c[0].description = "browser changed";
  loaded.revision = await saveMixedExams(store, loaded);
  expect(network).not.toHaveBeenCalled();
  expect(local.registry.c[0].description).toBe("browser changed");
  loaded.registry.c[1].description = "new confirmed marks";
  loaded.revision = await saveMixedExams(store, loaded);
  expect(remote.registry.c[1].description).toBe("new confirmed marks");
  expect(local.registry.c[1].description).toBe("preserve marks");
  const reloaded = await loadMixedExams(store);
  expect(reloaded.registry.c[1].description).toBe("new confirmed marks");
  remote.revision++;
  reloaded.registry.c[1].description = "stale tab";
  await expect(saveMixedExams(store, reloaded)).rejects.toThrow("Refresh before saving");
  expect(remote.registry.c[1].description).toBe("new confirmed marks");
});
