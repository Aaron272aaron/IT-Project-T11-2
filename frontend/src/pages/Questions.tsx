import { useState } from "react";
import { useApp, go } from "../state";
import { questions, saveMarks, type Answer } from "../domain";
import {
  Header,
  Card,
  Button,
  Badge,
  Progress,
  Field,
  Modal,
  Notice,
  Empty,
  Stat,
} from "../components/UI";
export function QuestionOverview({ id }: { id: number }) {
  const { answers, notify } = useApp();
  const q = questions.find((q) => q.id === id)!;
  const rows = answers.filter((a) => a.question === id);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [page, setPage] = useState(0);
  const groups = [...new Set(rows.map((a) => a.group))];
  const marked = rows.filter((a) => a.mark !== undefined).length;
  const filtered = rows.filter(
    (a) =>
      (filter === "All" ||
        (filter === "Marked" ? a.mark !== undefined : a.mark === undefined)) &&
      (!group || a.group === group) &&
      a.id.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = rows.filter((a) => a.group === (group || groups[0]));
  const open = (a: Answer) =>
    go(`/question/${id}/mark/${encodeURIComponent(a.id)}`);
  return (
    <>
      <Header
        crumb={`COMP10001 / Final exam / Question ${id}`}
        title={`Question ${id} · ${q.title}`}
        subtitle={`Question overview · ${q.kind === "short" ? "Short answer" : q.kind === "function" ? "Function + AI review" : "Executable code"} · ${q.max} marks`}
        actions={
          <Button onClick={() => go("/exam/final")}>Back to exam</Button>
        }
      />
      <Card className="question-prompt">
        <div>
          <h3>Question text</h3>
          <p>{q.prompt}</p>
          <Badge tone="success">
            {q.kind === "short"
              ? "Exact-answer grouping"
              : "Python · Human-confirmed marks"}
          </Badge>
        </div>
        <div>
          <small>MARKING PROGRESS</small>
          <h3>
            {marked} / {rows.length} marked
          </h3>
          <Progress
            value={rows.length ? Math.round((marked / rows.length) * 100) : 0}
            label={false}
          />
        </div>
      </Card>
      {q.kind === "short" && rows.length > 0 ? (
        <div className="marking-grid">
          <Card
            title="Answer groups"
            description="Select a group to inspect its answer and students."
          >
            <small>Students</small>
            <div className="bar-chart">
              {groups.slice(0, 12).map((g) => {
                const count = rows.filter((a) => a.group === g).length;
                return (
                  <button
                    aria-label={`Select group ${g}`}
                    className={(group || groups[0]) === g ? "selected" : ""}
                    key={g}
                    onClick={() => {
                      setGroup(g);
                      setPage(0);
                    }}
                  >
                    <b>{count}</b>
                    <i
                      style={{
                        height: `${Math.max(8, (count / Math.max(...groups.map((g) => rows.filter((a) => a.group === g).length))) * 115)}px`,
                      }}
                    />
                    <span>{g}</span>
                  </button>
                );
              })}
            </div>
            <small className="center">
              Answer group
              {groups.length > 12
                ? " · First 12 shown; use the group filter for all"
                : ""}
            </small>
          </Card>
          <Card title={`Group ${group || groups[0]} · Selected`}>
            <Badge tone="success">{selected.length} students</Badge>
            <h4>Shared response</h4>
            <p className="preserve">{selected[0]?.original}</p>
            <p className="helper">
              Exact text matching · Original answers preserved.
            </p>
            <Button
              variant="primary full"
              disabled={!selected.some((a) => !a.locked)}
              onClick={() => open(selected.find((a) => !a.locked)!)}
            >
              Review group {group || groups[0]}
            </Button>
          </Card>
        </div>
      ) : q.kind !== "short" ? (
        <>
          <div className="stats-grid">
            <Stat
              label="Responses marked"
              value={`${marked} / ${rows.length}`}
              detail="Confirmed by a human marker"
            />
            <Stat
              label="Passed tests (demo)"
              value={rows.filter((a) => a.test === "Passed").length}
              detail="Illustrative test evidence"
            />
            <Stat
              label="Needs review"
              value={rows.filter((a) => a.test !== "Passed").length}
              detail="Failed or not yet tested"
            />
          </div>
          <Notice>
            <div className="split">
              <div>
                <b>Automated testing · Demonstration data</b>
                <p>
                  The Python runner is not connected. Imported code is not
                  executed in the browser.
                </p>
              </div>
              <Button
                onClick={() =>
                  notify(
                    "These are example test results. Connect a backend API to run the Python sandbox.",
                  )
                }
              >
                About test results
              </Button>
            </div>
          </Notice>
        </>
      ) : null}
      <Card title="Student responses" className="table-card">
        <div className="toolbar">
          <div className="tabs">
            {["All", "Unmarked", "Marked"].map((f) => (
              <Button
                key={f}
                variant={filter === f ? "primary" : ""}
                onClick={() => {
                  setFilter(f);
                  setPage(0);
                }}
              >
                {f}{" "}
                {f === "All"
                  ? rows.length
                  : f === "Marked"
                    ? marked
                    : rows.length - marked}
              </Button>
            ))}
          </div>
          <input
            aria-label="Search student ID"
            placeholder="Search student ID"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          {q.kind === "short" && (
            <select
              aria-label="Filter answer group"
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          )}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Student ID</th>
                <th>
                  {q.kind === "short" ? "Original response" : "Test result"}
                </th>
                <th>{q.kind === "short" ? "Group" : "AI review"}</th>
                <th>Status</th>
                <th>Mark</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.slice(page * 8, page * 8 + 8).map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td className="response-cell">
                    {q.kind === "short" ? (
                      a.original
                    ) : (
                      <Badge
                        tone={
                          a.test === "Passed"
                            ? "success"
                            : a.test === "Failed"
                              ? "danger"
                              : ""
                        }
                      >
                        {a.test}
                      </Badge>
                    )}
                  </td>
                  <td>
                    {q.kind === "short" ? a.group : a.ai ? "Available" : "—"}
                  </td>
                  <td>
                    <Badge
                      tone={
                        a.locked
                          ? "warning"
                          : a.mark !== undefined
                            ? "success"
                            : ""
                      }
                    >
                      {a.locked
                        ? `Locked · ${a.locked}`
                        : a.mark !== undefined
                          ? "Marked"
                          : "Unmarked"}
                    </Badge>
                  </td>
                  <td>{a.mark === undefined ? "—" : `${a.mark} / ${q.max}`}</td>
                  <td>
                    <Button disabled={!!a.locked} onClick={() => open(a)}>
                      {a.locked
                        ? "Unavailable"
                        : a.mark === undefined
                          ? "Mark →"
                          : "Review →"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <Empty title="No responses found">
            <p>
              {rows.length
                ? "Adjust your filters to see more responses."
                : "Import student answers to begin marking."}
            </p>
            {!rows.length && (
              <Button onClick={() => go("/import")}>Import responses</Button>
            )}
          </Empty>
        )}
        <div className="table-note split">
          <span>
            Showing {filtered.length ? page * 8 + 1 : 0}–
            {Math.min(page * 8 + 8, filtered.length)} of {filtered.length}{" "}
            responses
          </span>
          <div className="actions">
            <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button
              disabled={(page + 1) * 8 >= filtered.length}
              onClick={() => setPage(page + 1)}
            >
              Next →
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
export function Marking({ id, student }: { id: number; student: string }) {
  const { answers, data, setData, notify } = useApp();
  const q = questions.find((q) => q.id === id)!;
  const answer = answers.find((a) => a.question === id && a.id === student);
  const [mark, setMark] = useState(answer?.mark?.toString() ?? "");
  const [comment, setComment] = useState(answer?.comment ?? "");
  const [scope, setScope] = useState("student");
  const [confirm, setConfirm] = useState<null | boolean>(null);
  const [error, setError] = useState("");
  if (!answer || answer.locked)
    return (
      <>
        <Header
          title={answer ? "Response unavailable" : "Response not found"}
        />
        <Notice>
          {answer
            ? `This demo response is locked by ${answer.locked}.`
            : "Return to the question to select an available response."}
        </Notice>
        <Button onClick={() => go(`/question/${id}`)}>Back to question</Button>
      </>
    );
  const group = answers.filter(
    (a) => a.question === id && a.original === answer.original,
  );
  const targets = scope === "group" ? group.filter((a) => !a.locked) : [answer];
  const fixture = student.startsWith("demo") && answer.test !== "Not run";
  function save(next: boolean) {
    try {
      if (!mark.trim())
        throw new Error("Enter a final mark before confirming.");
      const updated = saveMarks(
        answers,
        id,
        targets.map((a) => a.id),
        Number(mark),
        comment,
      );
      setData((d) => ({
        ...d,
        answers: { ...d.answers, [data.active]: updated },
      }));
      setConfirm(null);
      setError("");
      notify(
        `Final mark saved for ${targets.length} response${targets.length === 1 ? "" : "s"}.`,
      );
      if (next) {
        const remaining = updated.find(
          (a) =>
            a.question === id &&
            !a.locked &&
            a.mark === undefined &&
            !targets.some((t) => t.id === a.id),
        );
        go(
          remaining
            ? `/question/${id}/mark/${encodeURIComponent(remaining.id)}`
            : `/question/${id}`,
        );
      }
    } catch (e) {
      setError((e as Error).message);
      setConfirm(null);
    }
  }
  function requestSave(next: boolean) {
    if (scope === "group") setConfirm(next);
    else save(next);
  }
  return (
    <>
      <Header
        crumb={`COMP10001 / Final exam / Question ${id} / ${student}`}
        title={`Mark Question ${id} · ${q.title}`}
        subtitle={`${q.kind === "short" ? "Short-answer" : q.kind === "function" ? "Function" : "Executable-code"} marking · ${q.max} marks`}
        actions={
          <Button onClick={() => go(`/question/${id}`)}>
            Back to question
          </Button>
        }
      />
      <Card title="Question text">
        <p>{q.prompt}</p>
      </Card>
      <div className="marking-grid">
        <div className="stack">
          <div className={q.kind === "function" ? "two-cols" : ""}>
            <Card
              title={
                q.kind === "short"
                  ? "Original student response"
                  : "Original student code"
              }
              description={`${student} · Read only`}
            >
              <pre className="code-block">{answer.original}</pre>
              <Badge tone={answer.mark !== undefined ? "success" : ""}>
                {answer.mark !== undefined ? "Marked" : "Unmarked"}
              </Badge>
              <p className="helper">Submitted content is unchanged.</p>
            </Card>
            {q.kind === "function" && (
              <Card>
                <Badge tone="purple">AI SUGGESTION · DEMO</Badge>
                <h3>Minimal correction</h3>
                {fixture ? (
                  <>
                    <pre className="code-block corrected">
                      {answer.original.replace(/\)\n/, "):\n")}
                    </pre>
                    <p className="helper">
                      Illustrative suggestion only. No AI service has been
                      called.
                    </p>
                  </>
                ) : (
                  <Notice>
                    No suggestion available. Connect the local model through a
                    backend API.
                  </Notice>
                )}
                <Button
                  onClick={() =>
                    notify(
                      "Regeneration requires the local model backend. The original answer is never modified.",
                    )
                  }
                >
                  About AI suggestions
                </Button>
              </Card>
            )}
          </div>
          {q.kind === "short" ? (
            <Card
              title="Students affected by a group mark"
              description={`${group.length} identical responses · ${group.filter((a) => a.locked).length} locked responses will be skipped.`}
            >
              <div className="student-list">
                {group.map((a) => (
                  <div key={a.id}>
                    <span>{a.id}</span>
                    <span>
                      {a.locked
                        ? "Locked"
                        : a.mark === undefined
                          ? "Unmarked"
                          : `${a.mark} / ${q.max} · Marked`}
                    </span>
                    <button
                      disabled={!!a.locked}
                      onClick={() =>
                        go(`/question/${id}/mark/${encodeURIComponent(a.id)}`)
                      }
                    >
                      View response →
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card
              title={
                q.kind === "function"
                  ? "Same test cases · Original vs AI correction"
                  : "Automated test results"
              }
              description="Demo evidence — no Python code is executed by this frontend."
            >
              {fixture ? (
                <>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Input</th>
                          <th>Expected</th>
                          <th>
                            {q.kind === "function" ? "Original" : "Result"}
                          </th>
                          {q.kind === "function" && <th>Corrected</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {(id === 3
                          ? [
                              ["[1, 2, 3, 4]", "2"],
                              ["[]", "0"],
                              ["[-2, 0, 7]", "2"],
                            ]
                          : id === 4
                            ? [
                                ["[-1, 0, 2]", "[2]"],
                                ["[]", "[]"],
                                ["[1, 2]", "[1, 2]"],
                              ]
                            : id === 5
                              ? [
                                  ["' HELLO '", "'hello'"],
                                  ["'PyThOn'", "'python'"],
                                  ["' '", "''"],
                                ]
                              : [
                                  ["['a', 'a']", "{'a': 2}"],
                                  ["[]", "{}"],
                                  ["['a', 'b']", "{'a': 1, 'b': 1}"],
                                ]
                        ).map(([input, expected]) => (
                          <tr key={input}>
                            <td>
                              <code>{input}</code>
                            </td>
                            <td>
                              <code>{expected}</code>
                            </td>
                            <td
                              className={
                                answer.test === "Passed"
                                  ? "success-text"
                                  : "error"
                              }
                            >
                              {answer.test === "Passed"
                                ? "✓ Passed"
                                : "Not run · Syntax error"}
                            </td>
                            {q.kind === "function" && (
                              <td className="success-text">✓ Passed</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="helper">
                    Example results for the bundled demo response only.
                  </p>
                </>
              ) : (
                <Notice>
                  Tests have not been run for this response. A backend
                  connection is required.
                </Notice>
              )}
            </Card>
          )}
          <Card title="Marking rubric">
            {q.rubric.map(([text, value]) => (
              <div className="rubric-row" key={text}>
                <span>{text}</span>
                <span>{value} marks</span>
              </div>
            ))}
          </Card>
        </div>
        <Card className="decision">
          <Badge tone="success">HUMAN DECISION</Badge>
          <h2>
            {q.kind === "short" ? "Assign a final mark" : "Review and confirm"}
          </h2>
          {q.kind === "short" && (
            <Field label="Apply to">
              <div className="tabs">
                <Button
                  variant={scope === "student" ? "primary" : ""}
                  onClick={() => setScope("student")}
                >
                  This student
                </Button>
                <Button
                  variant={scope === "group" ? "primary" : ""}
                  onClick={() => setScope("group")}
                >
                  Entire group
                </Button>
              </div>
            </Field>
          )}
          {q.kind === "executable" && fixture && answer.test === "Passed" && (
            <Notice>
              <b>
                Test recommendation: {q.max} / {q.max}
              </b>
              <p>Review the original answer before confirming.</p>
            </Notice>
          )}
          <Field label={`Final mark · 0–${q.max}`}>
            <input
              type="number"
              min={0}
              max={q.max}
              step="0.5"
              value={mark}
              placeholder="Enter mark"
              onChange={(e) => setMark(e.target.value)}
            />
          </Field>
          <Field label="Marker comment · Optional">
            <textarea
              rows={5}
              value={comment}
              placeholder="Add your marking rationale…"
              onChange={(e) => setComment(e.target.value)}
            />
          </Field>
          {q.kind === "function" && (
            <Notice tone="purple">
              AI results are review evidence. Passing corrected tests does not
              assign a mark to the original answer.
            </Notice>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <p className="helper">Changes are unsaved until you confirm.</p>
          {q.kind === "executable" && fixture && answer.test === "Passed" && (
            <Button variant="full" onClick={() => setMark(String(q.max))}>
              Use recommended mark
            </Button>
          )}
          <Button variant="primary full" onClick={() => requestSave(false)}>
            Confirm final mark
          </Button>
          <Button variant="full" onClick={() => requestSave(true)}>
            Confirm and next response
          </Button>
          <p className="helper">
            Only a human marker confirms the final mark. Multi-user locks
            require a backend.
          </p>
        </Card>
      </div>
      {confirm !== null && (
        <Modal title="Confirm group mark" onClose={() => setConfirm(null)}>
          <p>
            Assign{" "}
            <b>
              {mark || "—"} / {q.max}
            </b>{" "}
            to <b>{targets.length}</b> identical responses?
          </p>
          <Notice tone="warning">
            {targets.filter((a) => a.mark !== undefined).length} existing marks
            will be replaced. {group.filter((a) => a.locked).length} locked
            responses will be skipped. Original answers remain unchanged.
          </Notice>
          <div className="form-actions">
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => save(confirm)}>
              Apply group mark
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
