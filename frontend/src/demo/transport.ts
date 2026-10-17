import testExamples from "./testExamples.json";
import Papa from "papaparse";
import type { ExamRecord, ExamRegistry } from "../models/exams";
import type { CanvasPreview } from "../models/canvasCsv";

// This transport is selected only for Explore demo workspace. Account APIs
// retain their normal network transport and never consume these snapshots.
const database = "automarktic-presentation-v1";
async function store(value?: { registry: ExamRegistry; revision: number }) {
  return new Promise<{ registry: ExamRegistry; revision: number }>(
    (resolve, reject) => {
      const opening = indexedDB.open(database, 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore("state");
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const tx = db.transaction("state", value ? "readwrite" : "readonly");
        const request = value
          ? tx.objectStore("state").put(value, "exams")
          : tx.objectStore("state").get("exams");
        tx.oncomplete = () => {
          db.close();
          resolve(value ?? request.result ?? { registry: {}, revision: 0 });
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    },
  );
}
let samplePromise: Promise<ExamRecord> | undefined;
function sample(): Promise<ExamRecord> {
  return (samplePromise ??= fetch(
    `${import.meta.env.BASE_URL}demo/sample-exam.json`,
  ).then(async (response) => {
    if (!response.ok)
      throw new Error("Could not open the presentation sample.");
    return response.json();
  }));
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Read real CSV bytes locally so uploads still show the selected students.
export function parseDemoCsv(text: string): CanvasPreview {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  const [header = [], ...rows] = parsed.data;
  const preview: CanvasPreview = { questions: [], students: [], issues: [] };
  for (let col = 0; col < header.length; col++) {
    const match = header[col].match(/^(\d+):\s*([\s\S]*)$/);
    if (match && Number.isFinite(Number(header[col + 1])))
      preview.questions.push({
        id: match[1],
        text: match[2],
        maxMark: Number(header[col + 1]),
        instruction: Number(header[col + 1]) === 0,
        column: col,
      });
  }
  const id = header.indexOf("sis_id"),
    canvas = header.indexOf("id"),
    attempt = header.indexOf("attempt");
  if (
    id < 0 ||
    canvas < 0 ||
    !preview.questions.length ||
    parsed.errors.length
  ) {
    preview.issues.push({
      severity: "error",
      record: 0,
      field: "CSV",
      message:
        "Choose a valid Canvas student analysis CSV with id, sis_id and question columns.",
    });
    return preview;
  }
  for (const row of rows) {
    if (!row[id]) continue;
    preview.students.push({
      id: row[id],
      canvasId: row[canvas] ?? "",
      attempt: row[attempt] ?? "1",
      answers: preview.questions.map((q) => {
        const original = row[q.column] ?? "";
        return {
          questionId: q.id,
          original,
          sourceScore: row[q.column + 1] ?? "",
          blank: !original.trim(),
          unicodeReview: /[^\x00-\x7F]/.test(original),
        };
      }),
    });
  }
  if (!preview.students.length)
    preview.issues.push({
      severity: "error",
      record: 0,
      field: "CSV",
      message: "No student responses were found.",
    });
  return preview;
}

export async function demoRequest(
  path: string,
  options: RequestInit,
): Promise<Response> {
  options.signal?.throwIfAborted();
  const body = typeof options.body === "string" ? JSON.parse(options.body) : {};
  if (path === "/api/exams") {
    if (options.method === "POST") {
      const saved = await store();
      if (saved.revision !== body.revision)
        return json(
          {
            message: "This demo was updated in another tab. Refresh and retry.",
          },
          409,
        );
      const next = { registry: body.registry, revision: saved.revision + 1 };
      await store(next);
      return json({ revision: next.revision });
    }
    return json(await store());
  }
  if (path === "/api/ai/reviews") return json({ reviews: [] });
  if (path.startsWith("/api/ai/model"))
    return json({
      status: "ready",
      downloadedBytes: 0,
      totalBytes: 0,
      percent: 100,
      filename: "",
      message: "Presentation examples ready",
      installed: true,
      modelId: "presentation",
    });
  if (path === "/api/ai/suggest-fix")
    return json({
      status: "already_valid",
      originalCode: body.code,
      suggestedCode: null,
      syntaxError: null,
      diff: [],
      message:
        "Demo review complete. Check the rubric before confirming a mark.",
      modelId: "presentation",
    });
  if (path === "/api/canvas/preview") {
    const preview = parseDemoCsv(await (options.body as Blob).text());
    const invalid = preview.issues.some((i) => i.severity === "error");
    return json(
      {
        service: "automarktic-python",
        parser: "csv_parser.py",
        status: invalid ? "invalid" : "ok",
        preview,
      },
      invalid ? 422 : 200,
    );
  }
  if (path === "/api/rubric/convert")
    return json({ pdf: (await sample()).rubric!.previewPdf!.split(",")[1] });
  if (path === "/api/rubric/import") {
    const exam = await sample();
    const questions = exam.answers!.preview.questions.filter(
      (q) => !q.instruction,
    );
    return json({
      blocks: questions.flatMap((q, index) => {
        const categories =
          exam.categories?.[q.id] ?? exam.categories?.[`canvas:${q.id}`];
        return categories?.length
          ? [
              {
                id: `demo-${q.id}`,
                title: `Question ${index + 1}`,
                context: q.text,
                questionNumbers: [index + 1],
                categories,
                warnings: [],
              },
            ]
          : [];
      }),
      warnings: ["Presentation draft based on the sample exam rubric."],
    });
  }
  if (path === "/api/answer-groups") {
    const groups = new Map<
      string,
      { group_id: string; answer: string; count: number; students: unknown[] }
    >();
    for (const row of body.answers) {
      const key = row.answer;
      if (!groups.has(key))
        groups.set(key, {
          group_id: `group-${groups.size.toString(16).padStart(20, "0")}`,
          answer: key,
          count: 0,
          students: [],
        });
      const group = groups.get(key)!;
      group.students.push(row);
      group.count++;
    }
    return json({
      schema_version: 1,
      submission_count: body.answers.length,
      group_count: groups.size,
      groups: [...groups.values()],
    });
  }
  if (path === "/api/test-runs") {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(body.code),
    );
    // Fixed presentation outcomes are deliberately not a code evaluator.
    const configured = testExamples[
      body.questionKey as keyof typeof testExamples
    ] ?? [
      {
        name: "Example case",
        input: "Sample input",
        expected: "Sample output",
      },
    ];
    const cases = configured.map((item, index) => ({
      ...item,
      actual:
        index === configured.length - 1 ? "Different output" : item.expected,
      outcome: index === configured.length - 1 ? "failed" : "passed",
      errorKind: null,
      error:
        index === configured.length - 1
          ? "Output differs from expected result."
          : "",
      duration: 0.01,
    }));
    return json({
      runId: crypto.randomUUID().replaceAll("-", ""),
      questionKey: body.questionKey,
      variant: body.variant,
      codeDigest: Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
      status: "completed",
      passed: cases.length - 1,
      total: cases.length,
      cases,
      message: "Demo test results",
    });
  }
  return json(
    { message: "This action is available in the signed-in workspace." },
    400,
  );
}
