import { useState } from "react";
import { useApp, go } from "../../state";
import { questions, type ModerationRecord } from "../../models/domain";
import {
  categoriesFor,
  previewCategoryScores,
  applyCategoryScores,
  studentTotals,
} from "../../utils/rubric";
import {
  Header,
  Card,
  Button,
  Field,
  Badge,
  Notice,
  Modal,
  Stat,
  Empty,
} from "../../components/UI";
export function Review() {
  const { workspace } = useApp();
  const [question, setQuestion] = useState(1);
  return (
    <>
      <Header
        crumb="COMP10001 / Final exam / Score review"
        title="Review rubric scores"
        subtitle="Review student results, then adjust a question’s category values consistently."
        actions={
          <Button onClick={() => go("/exam/final")}>Back to exam</Button>
        }
      />
      <Field label="Question to review">
        <select
          value={question}
          onChange={(e) => setQuestion(Number(e.target.value))}
        >
          {questions.map((q) => (
            <option key={q.id} value={q.id}>
              Q{q.id} · {q.title} · {q.max} marks
            </option>
          ))}
        </select>
      </Field>
      <ReviewQuestion
        key={`${workspace.id}-${question}-${workspace.moderationHistory?.length ?? 0}`}
        question={question}
      />
    </>
  );
}
function ReviewQuestion({ question }: { question: number }) {
  const { workspace, answers, data, setData, notify, isCoordinator } = useApp();
  const current = categoriesFor(question, workspace);
  const q = questions.find((q) => q.id === question)!;
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(current.map((c) => [c.id, String(c.score)])),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [query, setQuery] = useState("");
  const [affectedOnly, setAffectedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const proposed = Object.fromEntries(
    Object.entries(values).map(([id, v]) => [
      id,
      v.trim() === "" ? NaN : Number(v),
    ]),
  );
  let validation = "";
  let preview: ReturnType<typeof previewCategoryScores> | null = null;
  try {
    preview = previewCategoryScores(workspace, answers, question, proposed);
  } catch (e) {
    validation = (e as Error).message;
  }
  const before = studentTotals(answers);
  const after = new Map(
    studentTotals(preview?.answers ?? answers).map((s) => [s.id, s]),
  );
  const affected = new Set(preview?.affected.map((a) => a.student));
  const visible = before.filter(
    (s) =>
      s.id.toLowerCase().includes(query.toLowerCase()) &&
      (!affectedOnly || affected.has(s.id)),
  );
  const totalMax = questions.reduce((sum, q) => sum + q.max, 0);
  const mean = (list: typeof before) =>
    list.length
      ? (list.reduce((s, a) => s + a.total, 0) / list.length).toFixed(2)
      : "—";
  function openPreview() {
    if (validation) {
      setError(validation);
      return;
    }
    if (!reason.trim()) {
      setError("Enter a reason for this score change.");
      return;
    }
    if (!preview?.changes.length) {
      setError("Change at least one category score.");
      return;
    }
    setError("");
    setConfirm(true);
  }
  function apply() {
    try {
      const result = applyCategoryScores(
        workspace,
        answers,
        question,
        proposed,
        reason,
        "me",
      );
      setData((d) => ({
        ...d,
        workspaces: d.workspaces.map((w) =>
          w.id === workspace.id ? result.workspace : w,
        ),
        answers: { ...d.answers, [data.active]: result.answers },
      }));
      setConfirm(false);
      notify(
        `Category values updated. ${result.record.affected.length} response scores recalculated.`,
      );
    } catch (e) {
      setError((e as Error).message);
      setConfirm(false);
    }
  }
  return (
    <>
      {!isCoordinator && (
        <Notice tone="warning">
          Only a subject coordinator can change rubric category values. You can
          review the current results.
        </Notice>
      )}
      <div className="stats-grid">
        <Stat
          label="Students"
          value={before.length}
          detail={`${before.filter((s) => s.marked === questions.length).length} fully marked · ${questions.length} questions`}
        />
        <Stat
          label="Mean awarded total"
          value={`${mean(before)} → ${mean([...after.values()])}`}
          detail={`Out of ${totalMax} · Includes provisional totals`}
        />
        <Stat
          label="Affected students"
          value={affected.size}
          detail={`${preview?.affected.length ?? 0} confirmed response scores will change`}
        />
      </div>
      {before.some((s) => s.marked < questions.length) && (
        <Notice>
          Marking is still in progress. Totals below include confirmed marks
          only; incomplete totals are provisional. Unmarked responses remain
          unmarked and future category selections use the latest values.
        </Notice>
      )}
      <Card
        title={`Q${q.id} · Rubric category values`}
        description="Change the score attached to a category, not the marker’s classification of an answer."
        className="table-card"
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Marked responses</th>
                <th>Current score</th>
                <th>Proposed score</th>
              </tr>
            </thead>
            <tbody>
              {current.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.label}</b>
                    <small>{c.description}</small>
                  </td>
                  <td>
                    {
                      answers.filter(
                        (a) =>
                          a.question === question &&
                          a.categoryId === c.id &&
                          a.mark !== undefined,
                      ).length
                    }
                  </td>
                  <td>
                    {c.score} / {q.max}
                  </td>
                  <td>
                    <input
                      aria-label={`${c.label} proposed score`}
                      className="score-input"
                      disabled={!isCoordinator}
                      type="number"
                      min={0}
                      max={q.max}
                      step="0.01"
                      value={values[c.id]}
                      onChange={(e) => {
                        setValues({ ...values, [c.id]: e.target.value });
                        setPage(0);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="review-controls">
          {Boolean(preview?.legacyCount) && (
            <Notice tone="warning">
              {preview!.legacyCount} numeric marks have no rubric category and
              will remain unchanged. Open those responses and select a category
              before including them in category adjustments.
            </Notice>
          )}
          <Field label="Reason for score change *">
            <textarea
              disabled={!isCoordinator}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this category value should change…"
            />
          </Field>
          {(error || validation) && (
            <p role="alert" className="error">
              {error || validation}
            </p>
          )}
          <div className="split">
            <p className="helper">
              Original answers, category choices and marker comments are
              preserved.
            </p>
            <div className="actions">
              <Button
                onClick={() => {
                  setValues(
                    Object.fromEntries(
                      current.map((c) => [c.id, String(c.score)]),
                    ),
                  );
                  setReason("");
                  setError("");
                }}
              >
                Discard changes
              </Button>
              <Button
                variant="primary"
                disabled={
                  !isCoordinator || !preview?.changes.length || !!validation
                }
                onClick={openPreview}
              >
                Review and apply changes
              </Button>
            </div>
          </div>
        </div>
      </Card>
      <Card
        title="Student score preview"
        description="Compare current totals with the proposed category values before applying."
        className="table-card"
      >
        <div className="toolbar">
          <input
            aria-label="Search score review students"
            placeholder="Search student ID"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          <label className="check-label">
            <input
              type="checkbox"
              checked={affectedOnly}
              onChange={(e) => {
                setAffectedOnly(e.target.checked);
                setPage(0);
              }}
            />
            Affected students only
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Marked questions</th>
                <th>Current total</th>
                <th>Proposed total</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(page * 10, page * 10 + 10).map((s) => {
                const next = after.get(s.id)!;
                const delta = Math.round((next.total - s.total) * 100) / 100;
                return (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>
                      {s.marked} / {questions.length}{" "}
                      {s.marked < questions.length && (
                        <Badge>Provisional</Badge>
                      )}
                    </td>
                    <td>
                      {s.total} / {totalMax}
                    </td>
                    <td>
                      {next.total} / {totalMax}
                    </td>
                    <td>
                      {delta > 0 ? "+" : ""}
                      {delta}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visible.length && <Empty title="No matching students" />}
        <div className="table-note split">
          <span>
            {visible.length} students · Showing{" "}
            {visible.length ? page * 10 + 1 : 0}–
            {Math.min(page * 10 + 10, visible.length)}
          </span>
          <div className="actions">
            <Button disabled={!page} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button
              disabled={(page + 1) * 10 >= visible.length}
              onClick={() => setPage(page + 1)}
            >
              Next →
            </Button>
          </div>
        </div>
      </Card>
      <Card
        title="Category score change history"
        description="Changes recorded in this browser session."
      >
        {workspace.moderationHistory?.length ? (
          <div className="change-history">
            {[...workspace.moderationHistory]
              .reverse()
              .map((h: ModerationRecord) => (
                <article key={h.id}>
                  <b>
                    Q{h.question} ·{" "}
                    {h.changes
                      .map((c) => `${c.label}: ${c.before} → ${c.after}`)
                      .join("; ")}
                  </b>
                  <p>{h.reason}</p>
                  <small>
                    {h.actor} · {new Date(h.at).toLocaleString()} ·{" "}
                    {h.affected.length} responses recalculated
                  </small>
                </article>
              ))}
          </div>
        ) : (
          <p className="helper">No category score changes yet.</p>
        )}
      </Card>
      {confirm && preview && (
        <Modal
          title="Apply category score changes?"
          onClose={() => setConfirm(false)}
        >
          <p>
            <b>
              Q{q.id} · {q.title}
            </b>
          </p>
          {preview.changes.map((c) => (
            <div className="rubric-row" key={c.categoryId}>
              <span>{c.label}</span>
              <b>
                {c.before} → {c.after} / {q.max}
              </b>
            </div>
          ))}
          <Notice>
            {preview.affected.length} confirmed responses across {affected.size}{" "}
            students will be recalculated. Future category selections for this
            question will use the new scores.
          </Notice>
          <p>
            <b>Reason:</b> {reason}
          </p>
          <p className="helper">
            The original answers and selected categories will not change.
          </p>
          <div className="form-actions">
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="primary" onClick={apply}>
              Apply category scores
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
