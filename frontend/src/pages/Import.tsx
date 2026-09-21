import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { useApp, go } from "../state";
import {
  validateCsv,
  groupAnswers,
  download,
  sampleCsv,
  type Answer,
  type CsvIssue,
} from "../domain";
import {
  Header,
  Card,
  Button,
  Badge,
  Notice,
  Progress,
} from "../components/UI";
type Stage = "upload" | "errors" | "review" | "progress" | "done";
export function ImportPage() {
  const { answers, data, setData, workspace } = useApp();
  const [stage, setStage] = useState<Stage>("upload");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [issues, setIssues] = useState<CsvIssue[]>([]);
  const [incoming, setIncoming] = useState<Answer[]>([]);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [percent, setPercent] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const readVersion = useRef(0);
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      readVersion.current++;
    },
    [],
  );
  async function choose(f?: File) {
    if (!f) return;
    const version = ++readVersion.current;
    setError("");
    setFile(null);
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose a .csv file.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("Choose a CSV smaller than 10 MB.");
      return;
    }
    setReading(true);
    try {
      const text = await f.text();
      if (version === readVersion.current) {
        setFile({ name: f.name, text });
        setStage("upload");
      }
    } catch {
      setError("This file could not be read. Please choose it again.");
    } finally {
      if (version === readVersion.current) setReading(false);
    }
  }
  function validate() {
    if (!file) return;
    const result = validateCsv(file.text);
    const existing = new Set(
      answers.map((a) => JSON.stringify([a.id, a.question])),
    );
    result.answers.forEach((a, i) => {
      if (existing.has(JSON.stringify([a.id, a.question])))
        result.issues.push({
          row: i + 2,
          message: `${a.id} / question ${a.question} already exists in this exam. Import will not overwrite an answer.`,
        });
    });
    setIncoming(result.answers);
    setIssues(result.issues);
    setStage(result.issues.length ? "errors" : "review");
  }
  function importData() {
    setStage("progress");
    setPercent(0);
    let current = 0;
    timer.current = setInterval(() => {
      current += 20;
      setPercent(current);
      if (current >= 100) {
        clearInterval(timer.current!);
        timer.current = null;
        setData((d) => ({
          ...d,
          answers: {
            ...d.answers,
            [data.active]: groupAnswers([
              ...(d.answers[data.active] ?? []),
              ...incoming,
            ]),
          },
        }));
        setStage("done");
      }
    }, 200);
  }
  const step = stage === "upload" ? 1 : stage === "done" ? 3 : 2;
  const students = new Set(incoming.map((a) => a.id)).size;
  return (
    <>
      <Header
        crumb="COMP10001 / Exams / Final exam / Import"
        title="Import student answers"
        subtitle={`Final exam · ${workspace.period}, ${workspace.year}`}
        actions={<Badge tone="info">Coordinator only</Badge>}
      />
      <ol className="import-steps">
        {["Upload CSV", "Validate & review", "Import complete"].map(
          (label, i) => (
            <li
              key={label}
              className={i + 1 === step ? "active" : i + 1 < step ? "done" : ""}
            >
              <span>{i + 1 < step ? "✓" : i + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>
      <input
        className="sr-only"
        type="file"
        accept=".csv,text/csv"
        ref={input}
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {stage === "upload" ? (
        <div className="settings-grid">
          <Card
            title="Upload Canvas CSV"
            description="Choose the student answer export for this exam."
          >
            <div
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void choose(e.dataTransfer.files[0]);
              }}
            >
              <span className="upload-symbol">↑</span>
              <h3>
                {reading
                  ? "Reading file…"
                  : file
                    ? file.name
                    : "Drag and drop your CSV here"}
              </h3>
              <p>{file ? "Ready for validation" : "or choose a file below"}</p>
              <Button
                variant="primary"
                disabled={reading}
                onClick={() => input.current?.click()}
              >
                Choose CSV file
              </Button>
              <small>.csv · Up to 10,000 rows · 10 MB</small>
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <Notice>
              <b>Your file is checked before anything is imported.</b>
              <p>
                Missing columns, invalid rows and duplicate records are flagged.
              </p>
            </Notice>
            <div className="form-actions split">
              <Button onClick={() => go("/exam/final")}>Cancel</Button>
              <Button
                variant="primary"
                disabled={!file || reading}
                onClick={validate}
              >
                Validate CSV
              </Button>
            </div>
            <div className="sample-links">
              <button onClick={() => download("sample-answers.csv", sampleCsv)}>
                Download sample CSV
              </button>
              <button
                onClick={() => {
                  setFile({ name: "sample-answers.csv", text: sampleCsv });
                  setError("");
                }}
              >
                Use sample file
              </button>
              <button
                onClick={() => {
                  setFile({
                    name: "invalid-sample.csv",
                    text: "student_id,question_id,answer\n,1,3\ndemo241,99,Answer\n",
                  });
                  setError("");
                }}
              >
                Try validation errors
              </button>
            </div>
          </Card>
          <Card title="Before you import">
            <div className="info-section">
              <b>CSV export format</b>
              <p>
                This prototype reads one answer per row, using the column names
                below. Convert your Canvas export to this template first.
              </p>
              <code>student_id, question_id, answer</code>
            </div>
            <div className="info-section">
              <b>Required information</b>
              <p>
                Student IDs, question numbers (1–6) and answer data must be
                present.
              </p>
            </div>
            <div className="info-section">
              <b>Answer formatting</b>
              <p>
                Original answers stay unchanged, including indentation and line
                breaks. Short answers are grouped only when their full text
                matches exactly.
              </p>
            </div>
            <div className="info-section">
              <b>Local demo</b>
              <p>
                Imports stay in this browser tab’s session. This is not a
                permanent database.
              </p>
            </div>
          </Card>
        </div>
      ) : (
        <>
          <div className="file-summary card">
            <div>
              <b>{file?.name}</b>
              <p>{incoming.length.toLocaleString()} response records</p>
            </div>
            <Badge tone={stage === "errors" ? "warning" : "success"}>
              {stage === "errors"
                ? "Needs attention"
                : stage === "done"
                  ? "Imported"
                  : "Validation complete"}
            </Badge>
          </div>
          {stage === "errors" ? (
            <Card>
              <Notice tone="danger">
                <b>Import blocked: fix the issues below</b>
                <p>
                  No responses have been imported. Correct the CSV, then upload
                  it again.
                </p>
              </Notice>
              <div className="split">
                <h2>Validation issues</h2>
                <span>{issues.length} issues found</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th>Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.slice(0, 100).map((issue, i) => (
                      <tr key={i}>
                        <td>Row {issue.row}</td>
                        <td>{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {issues.length > 100 && (
                <p>
                  Showing the first 100 issues. Download the complete list
                  below.
                </p>
              )}
              <div className="form-actions split">
                <Button
                  onClick={() =>
                    download(
                      "validation-issues.csv",
                      Papa.unparse(issues, { escapeFormulae: true }),
                    )
                  }
                >
                  Download issues
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setStage("upload");
                    setFile(null);
                  }}
                >
                  Upload corrected CSV
                </Button>
              </div>
            </Card>
          ) : stage === "review" ? (
            <Card>
              <div className="review-stats">
                <div>
                  <strong>{students}</strong>
                  <p>Students</p>
                </div>
                <div>
                  <strong>{incoming.length.toLocaleString()}</strong>
                  <p>Responses</p>
                </div>
                <div>
                  <strong>
                    {new Set(incoming.map((a) => a.question)).size}
                  </strong>
                  <p>Questions</p>
                </div>
              </div>
              <Notice tone="success">
                <b>✓ No validation issues detected</b>
                <p>
                  All required information is present. Student and question
                  links are ready.
                </p>
              </Notice>
              <h2>Ready to import into Final exam</h2>
              <p>
                {students} students and {incoming.length} responses will be
                stored in this browser session. Original answer formatting is
                preserved.
              </p>
              <div className="info-section">
                <b>Checks passed</b>
                <p>
                  CSV structure and required columns · Valid question numbers ·
                  No missing answers · No duplicate or existing records
                </p>
              </div>
              <div className="form-actions split">
                <Button onClick={() => setStage("upload")}>
                  Choose another file
                </Button>
                <Button variant="primary" onClick={importData}>
                  Import {incoming.length.toLocaleString()} responses
                </Button>
              </div>
            </Card>
          ) : stage === "progress" ? (
            <Card className="import-result">
              <div className="spinner" />
              <h2>Importing student answers</h2>
              <p>Adding validated responses to this browser session.</p>
              <Progress value={percent} label={false} />
              <p aria-live="polite">{percent}% complete</p>
            </Card>
          ) : (
            <Card className="import-result">
              <div className="success-symbol">✓</div>
              <h2>Import complete</h2>
              <p>
                {incoming.length} responses from {students} students were
                imported successfully.
              </p>
              <p>Original answers are preserved. You can now begin marking.</p>
              <div className="actions">
                <Button
                  onClick={() => {
                    setStage("upload");
                    setFile(null);
                  }}
                >
                  Import another file
                </Button>
                <Button variant="primary" onClick={() => go("/exam/final")}>
                  Back to exam overview
                </Button>
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
