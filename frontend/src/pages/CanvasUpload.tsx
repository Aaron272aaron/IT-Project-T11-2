import { RubricAccess } from "../components/RubricWindow";
import { useEffect, useRef, useState } from "react";
import {
  Header,
  Card,
  Button,
  Badge,
  Notice,
  Field,
  Modal,
} from "../components/UI";
import { download } from "../domain";
import { go, useApp } from "../state";
import type { ExamRecord } from "../exams";
import { previewCanvasCsv } from "../api";
import {
  canvasExampleCsv,
  MAX_CANVAS_BYTES,
  type CanvasPreview,
} from "../canvasCsv";

export function CanvasUpload({
  exam,
  view = false,
}: {
  exam: ExamRecord;
  view?: boolean;
}) {
  const { saveExam, notify, isCoordinator } = useApp();
  const [confirmReplace, setConfirmReplace] = useState(false);
  // Validation is a draft until the user explicitly saves it to this exam.
  // Saved answers live in this browser tab and never overwrite demo marks.
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CanvasPreview | null>(
    view ? (exam.answers?.preview ?? null) : null,
  );
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");
  const [questionId, setQuestionId] = useState(
    view
      ? (exam.answers?.preview.questions.find((q) => !q.instruction)?.id ?? "")
      : "",
  );
  const [studentId, setStudentId] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const readVersion = useRef(0);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      readVersion.current++;
      request.current?.abort();
    },
    [],
  );

  function clear() {
    // Cancel in-flight uploads and ignore replies for an earlier file.
    readVersion.current++;
    request.current?.abort();
    setFile(null);
    setPreview(null);
    setError("");
    setValidating(false);
    setQuestionId("");
    setStudentId("");
    setStudentQuery("");
  }

  function choose(files: FileList | null) {
    clear();
    if (!files?.length) return;
    if (files.length !== 1) {
      setError("Choose one CSV file at a time.");
      return;
    }
    const selected = files[0];
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a .csv file, not an Excel workbook.");
      return;
    }
    if (selected.size > MAX_CANVAS_BYTES) {
      setError("Choose a CSV no larger than 10 MB.");
      return;
    }
    // Encoding and CSV rules are checked by Python after the user submits.
    setFile(selected);
  }

  async function validate() {
    if (!file || validating) return;
    const version = ++readVersion.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setValidating(true);
    setPreview(null);
    setError("");
    let timedOut = false;
    // Clear, file replacement and navigation also abort, but only this timer
    // should show a timeout. A failed request never falls back to a JS parser.
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30_000);
    try {
      const result = await previewCanvasCsv(file, controller.signal);
      if (version !== readVersion.current) return;
      setPreview(result);
      setQuestionId(
        result.questions.find((q) => !q.instruction)?.id ??
          result.questions[0]?.id ??
          "",
      );
      setStudentId(result.students[0]?.id ?? "");
      setStudentQuery("");
    } catch (error) {
      if (version !== readVersion.current) return;
      setError(
        timedOut
          ? "Python did not respond within 30 seconds. Check the backend and try again."
          : error instanceof Error
            ? error.message
            : "CSV upload failed. Please try again.",
      );
    } finally {
      window.clearTimeout(timeout);
      if (version === readVersion.current) {
        setValidating(false);
        request.current = null;
      }
    }
  }

  const errors =
    preview?.issues.filter((item) => item.severity === "error") ?? [];
  const warnings =
    preview?.issues.filter((item) => item.severity === "warning") ?? [];
  const ready = preview !== null && errors.length === 0;
  const markable = preview?.questions.filter((q) => !q.instruction) ?? [];
  const instructions = preview?.questions.filter((q) => q.instruction) ?? [];
  const question = preview?.questions.find((q) => q.id === questionId);
  const students =
    preview?.students.filter((s) =>
      s.id.toLowerCase().includes(studentQuery.toLowerCase()),
    ) ?? [];
  const student = students.find((s) => s.id === studentId) ?? students[0];
  const answer = student?.answers.find((a) => a.questionId === questionId);
  // Put blocking errors first so a large warning list cannot hide them.
  const issues = [...errors, ...warnings];

  function saveAnswers() {
    if (!ready || !preview || !file) return;
    try {
      saveExam({
        ...exam,
        marks: {},
        questionTypes: Object.fromEntries(
          Object.entries(exam.questionTypes ?? {}).filter(([id]) =>
            preview.questions.some((q) => q.id === id && !q.instruction),
          ),
        ),
        // Keep only rubrics whose stable question IDs and score limits still match.
        categories: Object.fromEntries(
          Object.entries(exam.categories ?? {}).filter(([id, options]) =>
            preview.questions.some(
              (q) =>
                q.id === id &&
                !q.instruction &&
                options.every((c) => c.score <= q.maxMark),
            ),
          ),
        ),
        autoMarkedQuestionIds: (exam.autoMarkedQuestionIds ?? []).filter((id) =>
          preview.questions.some((q) => q.id === id && !q.instruction),
        ),
        rubricPages: Object.fromEntries(
          Object.entries(exam.rubricPages ?? {}).filter(
            ([key]) => !key.startsWith("canvas:"),
          ),
        ),
        answers: {
          name: file.name,
          uploadedAt: new Date().toISOString(),
          preview,
        },
      });
      notify(`Answers saved to ${exam.title}.`);
      go(`/exam/${exam.id}`);
    } catch (reason) {
      setConfirmReplace(false);
      setError(
        reason instanceof Error ? reason.message : "Could not save answers.",
      );
    }
  }
  return (
    <>
      <Header
        crumb={`COMP10001 / Exams / ${exam.title} / ${view ? "Answers" : "Upload answers"}`}
        title={view ? "Uploaded answers" : "Upload answer CSV"}
        subtitle={`Answers for ${exam.title}.`}
        actions={
          <Button onClick={() => go(`/exam/${exam.id}`)}>Back to exam</Button>
        }
      />
      {view && preview && isCoordinator && (
        <div className="actions">
          <RubricAccess exam={exam} questionKey={`canvas:${questionId}`} />
        </div>
      )}
      <Notice>
        <b>
          {view
            ? "Saved to this exam in this browser tab"
            : "Validate first, then save to this exam"}
        </b>
        <p>
          {view
            ? "Answers remain available after refresh in this tab. No database is connected."
            : "Python checks your CSV. Save the valid result to this exam after reviewing it. Leaving before saving discards the new preview."}
        </p>
      </Notice>
      {view && !preview && isCoordinator && (
        <Card title="No answers uploaded">
          <Button onClick={() => go(`/exam/${exam.id}/answers/upload`)}>
            Upload answer CSV
          </Button>
        </Card>
      )}
      {!view && (
        <>
          <input
            ref={input}
            className="sr-only"
            type="file"
            accept=".csv,text/csv"
            aria-label="Answer CSV file"
            onChange={(event) => {
              void choose(event.target.files);
              event.target.value = "";
            }}
          />
          <div className="settings-grid">
            <Card title="Select a Canvas CSV">
              <div
                className="dropzone canvas-dropzone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void choose(event.dataTransfer.files);
                }}
              >
                <span className="upload-symbol" aria-hidden="true">
                  ↑
                </span>
                <h3>
                  {validating
                    ? "Python is checking your CSV…"
                    : (file?.name ?? "Drag and drop your CSV here")}
                </h3>
                <p>
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB · Ready to validate`
                    : "or choose a file from your computer"}
                </p>
                <Button
                  variant="primary"
                  onClick={() => input.current?.click()}
                >
                  Choose CSV file
                </Button>
                <small>UTF-8 .csv · Up to 10,000 students · 10 MB</small>
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                {(file || preview || error) && (
                  <Button onClick={clear}>Clear file</Button>
                )}
                <Button
                  variant="primary"
                  disabled={!file || validating}
                  onClick={validate}
                >
                  {validating ? "Waiting for Python…" : "Validate and preview"}
                </Button>
              </div>
              <div className="sample-links">
                <button
                  onClick={() =>
                    download("canvas-example.csv", canvasExampleCsv)
                  }
                >
                  Download example CSV
                </button>
              </div>
            </Card>
            <Card title="What this file contains">
              <div className="info-section">
                <b>Canvas quiz analysis format</b>
                <p>
                  One student per row, with id, sis_id and attempt columns. Each
                  question is followed by its score column. Upload the original
                  export directly.
                </p>
              </div>
              <div className="info-section">
                <b>Original text stays intact</b>
                <p>
                  Quoted commas, code indentation, line breaks and blank answers
                  are preserved.
                </p>
              </div>
              <div className="info-section">
                <b>{exam.rubric ? "Rubric attached" : "Rubric optional"}</b>
                <p>
                  You can add or replace the rubric on the exam page. Source
                  scores remain reference values; no final marks are assigned.
                </p>
              </div>
            </Card>
          </div>
        </>
      )}
      {preview && (
        <>
          <div role="status" aria-live="polite">
            <p>Processed by Python · csv import.py</p>
            <Notice tone={ready ? "success" : "danger"}>
              <b>
                {ready
                  ? "CSV validated · Preview ready"
                  : "Preview blocked: fix the CSV errors"}
              </b>
              <p>
                {errors.length} errors · {warnings.length} warnings.{" "}
                {ready
                  ? "Review the notes and original answers below."
                  : "Correct the file and choose it again. No answers have been added to an exam."}
              </p>
            </Notice>
          </div>
          {ready && (
            <>
              {!view && (
                <div className="form-actions">
                  <Button
                    variant="primary"
                    onClick={() =>
                      exam.answers ? setConfirmReplace(true) : saveAnswers()
                    }
                  >
                    Save answers to exam
                  </Button>
                </div>
              )}
              <Card title="File overview">
                <div className="canvas-summary">
                  <div>
                    <strong>{preview.students.length}</strong>
                    <span>Students</span>
                  </div>
                  <div>
                    <strong>{markable.length}</strong>
                    <span>Questions</span>
                  </div>
                  <div>
                    <strong>{instructions.length}</strong>
                    <span>Section introductions</span>
                  </div>
                  <div>
                    <strong>{preview.students.length * markable.length}</strong>
                    <span>Answer records</span>
                  </div>
                </div>
                <p>
                  {preview.students.length * preview.questions.length} total
                  records including section introductions.{" "}
                  {exam.rubric
                    ? "Rubric attached as a reference."
                    : "Rubric not supplied."}
                </p>
              </Card>
              <Card title="Original answer preview" className="canvas-preview">
                <div className="two-cols">
                  <Field label="Question or section">
                    <select
                      value={questionId}
                      onChange={(event) => setQuestionId(event.target.value)}
                    >
                      <optgroup label="Questions">
                        {markable.map((q, i) => (
                          <option key={q.id} value={q.id}>
                            Q{i + 1} · Canvas {q.id} · {q.maxMark} marks
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Section introductions">
                        {instructions.map((q) => (
                          <option key={q.id} value={q.id}>
                            Canvas {q.id} · {q.text.split("\n")[0].slice(0, 70)}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </Field>
                  <Field label="Search student ID">
                    <input
                      value={studentQuery}
                      onChange={(event) => setStudentQuery(event.target.value)}
                      placeholder="Filter students"
                    />
                  </Field>
                </div>
                {question && (
                  <>
                    <div className="actions">
                      <Badge tone="info">Canvas ID {question.id}</Badge>
                      <Badge>
                        {question.instruction
                          ? "Section introduction"
                          : `${question.maxMark} marks · Type not configured`}
                      </Badge>
                    </div>
                    <h3>Question text</h3>
                    {/* Render untrusted CSV text as text, never as HTML. */}
                    <pre
                      className="canvas-original"
                      data-testid="canvas-question"
                    >
                      {question.text}
                    </pre>
                  </>
                )}
                {students.length ? (
                  <>
                    <Field label="Student">
                      <select
                        aria-label="Student"
                        value={student?.id ?? ""}
                        onChange={(event) => setStudentId(event.target.value)}
                      >
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.id} · Attempt {s.attempt}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="split canvas-answer-heading">
                      <h3>Original answer</h3>
                      <Badge>
                        {question?.instruction ? "Not applicable" : "Unmarked"}
                      </Badge>
                    </div>
                    {answer?.blank && (
                      <Notice tone="warning">
                        Blank answer retained for review.
                      </Notice>
                    )}
                    {answer?.unicodeReview && (
                      <Notice tone="warning">
                        This answer contains unusual formatting. Its original
                        text is unchanged.
                      </Notice>
                    )}
                    <pre
                      className="canvas-original"
                      data-testid="canvas-answer"
                    >
                      {answer?.original || "(No answer text)"}
                    </pre>
                    <p>
                      Canvas source score:{" "}
                      <strong>
                        {answer?.sourceScore.trim() || "Not provided"}
                      </strong>{" "}
                      · Reference only, not a final mark.
                    </p>
                  </>
                ) : (
                  <p>No students match this ID.</p>
                )}
              </Card>
            </>
          )}
          {issues.length > 0 && (
            <Card title={`Validation notes (${issues.length})`}>
              <p>
                Record numbers count CSV records, not physical lines inside
                multi-line answers.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Level</th>
                      <th>Record</th>
                      <th>Field</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.slice(0, 100).map((item, index) => (
                      <tr key={index}>
                        <td>
                          <Badge
                            tone={
                              item.severity === "error" ? "warning" : "info"
                            }
                          >
                            {item.severity}
                          </Badge>
                        </td>
                        <td>{item.record}</td>
                        <td>{item.field}</td>
                        <td>{item.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {issues.length > 100 && (
                <p>
                  Showing the first 100 notes. Download the report for all
                  locations.
                </p>
              )}
              <div className="form-actions">
                <Button
                  onClick={() =>
                    download(
                      "canvas-validation-notes.json",
                      JSON.stringify(issues, null, 2),
                      "application/json;charset=utf-8",
                    )
                  }
                >
                  Download validation notes
                </Button>
              </div>
            </Card>
          )}
        </>
      )}
      {confirmReplace && (
        <Modal
          title="Replace this exam's answers?"
          onClose={() => setConfirmReplace(false)}
        >
          <p>
            This replaces {exam.answers?.name} with {file?.name} for{" "}
            {exam.title}. The rubric is unchanged.
          </p>
          <p>
            Rubric page assignments for CSV questions will be cleared. Assign
            their pages again after replacing answers.
          </p>
          <div className="form-actions">
            <Button onClick={() => setConfirmReplace(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveAnswers}>
              Replace answers
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
