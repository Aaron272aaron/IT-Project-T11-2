import { useState } from "react";
import type { ExamRecord } from "../../models/exams";
import {
  rubricQuestions,
  validRange,
  assignSequentialPages,
} from "../../utils/rubricPages";
import { useApp } from "../../state";
import { Button, Card } from "../UI";
import { RubricWindow } from "./RubricWindow";

// Page numbers refer to the PDF preview, not printed labels or Word section numbers.
export function RubricPageMapping({ exam }: { exam: ExamRecord }) {
  const { saveExam, notify } = useApp();
  const [ranges, setRanges] = useState(exam.rubricPages ?? {});
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  const rows = rubricQuestions(exam);
  const count = exam.rubric?.pageCount ?? 0;
  const [first, setFirst] = useState(1);
  const [last, setLast] = useState(rows.length);
  const [start, setStart] = useState(1);
  const [pagesEach, setPagesEach] = useState(1);
  const [draft, setDraft] = useState(false);
  function sequence() {
    try {
      const generated = assignSequentialPages(
        rows.map((q) => q.key),
        first,
        last,
        start,
        pagesEach,
        count,
      );
      setRanges((old) => ({ ...old, ...generated }));
      setDraft(true);
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  function save() {
    const validKeys = new Set(rows.map((q) => q.key));
    const next = Object.fromEntries(
      Object.entries(ranges).filter(([key]) => validKeys.has(key)),
    );
    if (Object.values(next).some((range) => !validRange(range, count))) {
      setError(
        `Use whole page numbers from 1 to ${count}, with the end page at or after the start.`,
      );
      return;
    }
    try {
      saveExam({ ...exam, rubricPages: next });
      setError("");
      setDraft(false);
      notify("Rubric page assignments saved.");
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <Card className="rubric-assignments">
      <details>
        <summary>
          <strong>Rubric pages by question</strong>
          <span>
            {
              Object.keys(exam.rubricPages ?? {}).filter((key) =>
                rows.some((q) => q.key === key),
              ).length
            }{" "}
            / {rows.length} assigned · Expand to edit
            {draft ? " · Unsaved changes" : ""}
          </span>
        </summary>
        <p className="helper">
          Use preview pages 1–{count}. Multiple questions can share pages. Save
          after editing.
        </p>
        {!!rows.length && (
          <div className="sequential-pages">
            <h3>Assign pages sequentially</h3>
            <div className="sequence-fields">
              <label>
                From question
                <input
                  type="number"
                  min={1}
                  max={rows.length}
                  value={first}
                  onChange={(e) => setFirst(Number(e.target.value))}
                />
              </label>
              <label>
                To question
                <input
                  type="number"
                  min={first}
                  max={rows.length}
                  value={last}
                  onChange={(e) => setLast(Number(e.target.value))}
                />
              </label>
              <label>
                Starting page
                <input
                  type="number"
                  min={1}
                  max={count}
                  value={start}
                  onChange={(e) => setStart(Number(e.target.value))}
                />
              </label>
              <label>
                Pages per question
                <input
                  type="number"
                  min={1}
                  max={count}
                  value={pagesEach}
                  onChange={(e) => setPagesEach(Number(e.target.value))}
                />
              </label>
            </div>
            <p className="helper">
              Replaces the draft assignments for this question range. Existing
              saved assignments stay unchanged until you save.
            </p>
            <Button onClick={sequence}>Assign pages sequentially</Button>
            {draft && (
              <p role="status">
                Draft changed. Check the pages below, then save page
                assignments.
              </p>
            )}
          </div>
        )}

        <Button onClick={() => setPreview(1)}>Preview rubric</Button>
        {!rows.length && (
          <p>Upload the answer CSV first to see its questions here.</p>
        )}
        {!!rows.length && (
          <div className="table-scroll mapping-table">
            <table>
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Start page</th>
                  <th>End page</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((q) => (
                  <tr key={q.key}>
                    <td>
                      <details className="mapping-question">
                        <summary>
                          {q.label.replace(/\s+/g, " ").slice(0, 110)}
                          {q.label.length > 110 ? "…" : ""}
                        </summary>
                        <p>{q.label}</p>
                      </details>
                    </td>
                    {(["start", "end"] as const).map((side) => (
                      <td key={side}>
                        <input
                          className="page-number"
                          type="number"
                          min={1}
                          max={count}
                          step={1}
                          aria-label={`${q.label} ${side} page`}
                          value={ranges[q.key]?.[side] ?? ""}
                          onChange={(e) => {
                            const value =
                              e.target.value === ""
                                ? 0
                                : Number(e.target.value);
                            setDraft(true);
                            setRanges((old) => ({
                              ...old,
                              [q.key]: {
                                start: old[q.key]?.start ?? value,
                                end: old[q.key]?.end ?? value,
                                [side]: value,
                              },
                            }));
                          }}
                        />
                      </td>
                    ))}
                    <td>
                      <Button
                        disabled={
                          !validRange(
                            ranges[q.key] ?? { start: 0, end: 0 },
                            count,
                          )
                        }
                        onClick={() => setPreview(ranges[q.key].start)}
                      >
                        Check page
                      </Button>{" "}
                      <Button
                        onClick={() =>
                          setRanges((old) => {
                            setDraft(true);
                            const next = { ...old };
                            delete next[q.key];
                            return next;
                          })
                        }
                      >
                        Clear
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!!rows.length && (
          <div className="form-actions">
            <Button variant="primary" onClick={save}>
              Save page assignments
            </Button>
          </div>
        )}
      </details>
      {preview !== null && exam.rubric && (
        <RubricWindow
          key={preview}
          rubric={exam.rubric}
          initialPage={preview}
          context="Coordinator preview · Verify each question before saving its pages"
          onClose={() => setPreview(null)}
        />
      )}
    </Card>
  );
}
