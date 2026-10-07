import { useEffect, useRef, useState } from "react";
import type { ExamRecord, RubricCategory } from "../exams";
import { useApp } from "../state";
import {
  affectedMarks,
  saveCategories,
  validateCategories,
  type CategoryMap,
} from "../rubricEditor";
import { groupCategories, groupCategoryMap } from "../rubricScores";
import { importRubric, type RubricImport } from "../rubricImport";
import { Button, Card, Field, Notice } from "./UI";

// Coordinator-only drafts: document parsing never writes to saved exam state.
export function RubricEditor({ exam }: { exam: ExamRecord }) {
  const { saveExam, notify, isCoordinator } = useApp();
  const questions =
    exam.answers?.preview.questions.filter((q) => !q.instruction) ?? [];
  const [draft, setDraft] = useState<CategoryMap>(() =>
    groupCategoryMap(exam.categories),
  );
  const [qid, setQid] = useState(questions[0]?.id ?? "");
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState<RubricImport | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const question = questions.find((q) => q.id === qid);
  const options = draft[qid] ?? [];
  const affected = affectedMarks(exam, draft);
  if (!isCoordinator) return null;
  function edit(next: RubricCategory[]) {
    setDraft((current) => ({ ...current, [qid]: next }));
    setReview(false);
    setError("");
  }
  async function read(file?: File) {
    if (!file) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setImported(null);
    setReview(false);
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const result = await importRubric(file, controller.signal);
      if (controller.signal.aborted) return;
      setImported({
        ...result,
        blocks: result.blocks.map((block) => ({
          ...block,
          categories: groupCategories(
            block.categories.map((c, i) => ({ ...c, id: String(i) })),
          ),
        })),
      });
      setTargets(
        Object.fromEntries(
          result.blocks.map((b) => [
            b.id,
            b.questionNumbers.filter((n) => questions[n - 1]).join(", "),
          ]),
        ),
      );
    } catch (e) {
      if (request.current === controller)
        setError(
          controller.signal.aborted
            ? "Import cancelled or timed out. Your saved rubric is unchanged."
            : (e as Error).message,
        );
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) setBusy(false);
    }
  }
  function readSaved() {
    if (!exam.rubric) return;
    const bytes = Uint8Array.from(
      atob(exam.rubric.dataUrl.split(",")[1]),
      (c) => c.charCodeAt(0),
    );
    void read(new File([bytes], exam.rubric.name));
  }
  function applyImport() {
    try {
      const next = structuredClone(draft);
      const used = new Set<string>();
      for (const block of imported?.blocks ?? []) {
        const input = targets[block.id]?.trim();
        if (!input) continue;
        if (!/^\d+(?:\s*,\s*\d+)*$/.test(input))
          throw new Error(
            "Use comma-separated question numbers, such as 1, 2, 3. Leave unmatched sections blank.",
          );
        for (const number of input.split(",").map(Number)) {
          const q = questions[number - 1];
          if (!q) throw new Error(`Question ${number} is not in this exam.`);
          if (used.has(q.id))
            throw new Error(
              `Question ${number} is assigned to more than one imported section.`,
            );
          used.add(q.id);
          const matched = new Set<string>();
          next[q.id] = groupCategories(
            block.categories.map((c) => ({ ...c, id: crypto.randomUUID() })),
          ).map((c) => {
            // A score group keeps its identity and all merged historical option IDs.
            const old = next[q.id]?.find(
              (o) =>
                (o.score === c.score ||
                  o.description.trim() === c.description.trim()) &&
                !matched.has(o.id),
            );
            if (old) matched.add(old.id);
            return {
              ...c,
              id: old?.id ?? crypto.randomUUID(),
              mergedIds: old?.mergedIds,
            };
          });
        }
      }
      if (!used.size)
        throw new Error(
          "Associate at least one rubric section with an exam question.",
        );
      validateCategories(exam, next);
      setDraft(groupCategoryMap(next));
      setQid([...used][0]);
      setImported(null);
      setReview(false);
      setError("");
      notify(
        "Imported options added to the draft. Review each question, then save rubric options.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function preview() {
    try {
      validateCategories(exam, draft);
      const grouped = groupCategoryMap(draft);
      validateCategories(exam, grouped);
      setDraft(grouped);
      setReview(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function save() {
    try {
      if (!isCoordinator) return;
      saveExam(
        saveCategories(exam, draft, exam.autoMarkedQuestionIds ?? [], reason),
      );
      setReview(false);
      setReason("");
      setError("");
      notify("Rubric options saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Card className="rubric-editor">
      <details>
        <summary>
          <strong>Rubric options by question</strong>
          <span className="helper">
            {" "}
            · {questions.filter((q) => draft[q.id]?.length).length} /{" "}
            {questions.length} configured
          </span>
        </summary>
        {!questions.length ? (
          <Notice>
            Upload and save the answer CSV first to create the question list.
            Then associate a rubric with each question.
          </Notice>
        ) : (
          <>
            <Notice>
              Changing rubric scores will update all previously marked responses
              that use the affected score options.
            </Notice>
            <details className="rubric-import">
              <summary>Automatically create rubric from document</summary>
              <p>
                Upload a DOCX or text-based PDF using the standard guide format.
                Python reads the document; check the proposed question
                associations before applying. Scanned PDFs are not supported.
              </p>
              <Field label="Import rubric document">
                <input
                  type="file"
                  accept=".docx,.pdf"
                  disabled={busy}
                  onChange={(e) => {
                    void read(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </Field>
              <div className="form-actions">
                {exam.rubric && (
                  <Button disabled={busy} onClick={readSaved}>
                    Read saved rubric document
                  </Button>
                )}
                {busy && (
                  <Button onClick={() => request.current?.abort()}>
                    Cancel import
                  </Button>
                )}
              </div>
              {busy && <p role="status">Reading rubric…</p>}
              {imported && (
                <div className="imported-rubrics">
                  {imported.warnings.map((w, i) => (
                    <Notice key={i}>{w}</Notice>
                  ))}
                  {imported.blocks.map((b, i) => (
                    <div className="imported-block" key={b.id}>
                      <b>
                        Section {i + 1} · {b.categories.length} options
                      </b>
                      <Field
                        label={`Questions for section ${i + 1}`}
                        hint="Comma-separated exam question numbers; blank means skip."
                      >
                        <input
                          aria-label={`Questions for section ${i + 1}`}
                          value={targets[b.id] ?? ""}
                          onChange={(e) =>
                            setTargets({ ...targets, [b.id]: e.target.value })
                          }
                        />
                      </Field>
                      <details>
                        <summary>Source text and options</summary>
                        <p>{b.title}</p>
                        <p className="preserve">{b.context}</p>
                        {b.categories.map((c, n) => (
                          <p className="preserve" key={n}>
                            <b>{c.score} marks</b> — {c.description}
                          </p>
                        ))}
                      </details>
                      {b.warnings.map((w, n) => (
                        <p className="helper" key={n}>
                          {w}
                        </p>
                      ))}
                    </div>
                  ))}
                  <div className="form-actions">
                    <Button onClick={applyImport}>Apply imported draft</Button>
                    <Button onClick={() => setImported(null)}>
                      Discard import
                    </Button>
                  </div>
                </div>
              )}
            </details>
            <section
              className="rubric-question-selector"
              aria-label="Current question"
            >
              <Field label="Edit question rubric">
                <select
                  value={qid}
                  onChange={(e) => {
                    setQid(e.target.value);
                    setReview(false);
                  }}
                >
                  {questions.map((q, i) => (
                    <option key={q.id} value={q.id}>
                      Question {i + 1}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="rubric-question-numbers">
                <div>
                  <span>Maximum marks</span>
                  <strong>{question?.maxMark ?? 0}</strong>
                </div>
                <div>
                  <span>Score options</span>
                  <strong>{options.length}</strong>
                </div>
              </div>
              <details>
                <summary>Question text</summary>
                <p className="preserve">{question?.text}</p>
              </details>
            </section>
            {options.map((c, i) => (
              <div className="rubric-option-editor" key={c.id}>
                <Field label={`Option ${i + 1} score`}>
                  <input
                    type="number"
                    min="0"
                    max={question?.maxMark}
                    step="0.01"
                    onBlur={() => edit(groupCategories(options))}
                    value={Number.isNaN(c.score) ? "" : c.score}
                    onChange={(e) =>
                      edit(
                        options.map((o) =>
                          o.id === c.id
                            ? {
                                ...o,
                                score:
                                  e.target.value === ""
                                    ? NaN
                                    : Number(e.target.value),
                              }
                            : o,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label={`Option ${i + 1} description`}>
                  <textarea
                    aria-label={`Option ${i + 1} description`}
                    rows={3}
                    maxLength={10000}
                    value={c.description}
                    onChange={(e) =>
                      edit(
                        options.map((o) =>
                          o.id === c.id
                            ? { ...o, description: e.target.value }
                            : o,
                        ),
                      )
                    }
                  />
                </Field>
                <Button
                  onClick={() => edit(options.filter((o) => o.id !== c.id))}
                >
                  Remove option {i + 1}
                </Button>
              </div>
            ))}
            {!options.length && (
              <Notice>
                No options yet. Add an option or import a document.
              </Notice>
            )}
            <div className="form-actions">
              <Button
                onClick={() =>
                  edit([
                    ...options,
                    { id: crypto.randomUUID(), score: NaN, description: "" },
                  ])
                }
              >
                Add option
              </Button>
              <Button variant="primary" disabled={busy} onClick={preview}>
                Save rubric options
              </Button>
              <Button
                onClick={() => {
                  setDraft(groupCategoryMap(exam.categories));
                  setReview(false);
                  setError("");
                }}
              >
                Discard option changes
              </Button>
            </div>
            {review && (
              <div className="rubric-save-review">
                <h3>Review rubric changes</h3>
                <p>
                  {affected.length} confirmed marks have a changed score or a
                  removed option. Unconfigured questions cannot be marked
                  manually.
                </p>
                {!!affected.length && (
                  <>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Question</th>
                            <th>Student</th>
                            <th>Saved score</th>
                            <th>New option score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {affected.map((a) => (
                            <tr key={`${a.questionId}-${a.studentId}`}>
                              <td>
                                {questions.findIndex(
                                  (q) => q.id === a.questionId,
                                ) + 1}
                              </td>
                              <td>{a.studentId}</td>
                              <td>{a.before}</td>
                              <td>{a.after ?? "Removed — keep saved mark"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Field label="Reason for rubric change">
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </Field>
                    <p>
                      All confirmed marks using a retained option will be
                      updated to its new score. Deleted options keep their saved
                      marks until a tutor selects another option.
                    </p>
                  </>
                )}
                <Button variant="primary" onClick={save}>
                  Confirm rubric changes
                </Button>
                <Button onClick={() => setReview(false)}>
                  Back to editing
                </Button>
              </div>
            )}
            {!!exam.rubricChanges?.length && (
              <details>
                <summary>
                  Rubric change history ({exam.rubricChanges.length})
                </summary>
                {[...exam.rubricChanges].reverse().map((c, i) => (
                  <p key={i}>
                    {new Date(c.at).toLocaleString()} · {c.reason} ·{" "}
                    {c.updatedMarks} saved scores updated
                  </p>
                ))}
              </details>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </details>
    </Card>
  );
}
