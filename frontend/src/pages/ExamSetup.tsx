import { useState, type FormEvent } from "react";
import { useApp, go } from "../state";
import type { ExamAttachment, ExamRecord } from "../exams";
import { Header, Card, Button, Field, Notice, Stat } from "../components/UI";
import { RubricPageMapping } from "../components/RubricPageMapping";
import { RubricPicker } from "../components/RubricPicker";

export function CreateExam() {
  const { saveExam, notify, exams } = useApp();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rubric, setRubric] = useState<ExamAttachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !title.trim()) return;
    if (
      exams.some(
        (exam) => exam.title.toLowerCase() === title.trim().toLowerCase(),
      )
    ) {
      setError("An exam with this name already exists in this workspace.");
      return;
    }
    const exam: ExamRecord = {
      id: crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      ...(rubric ? { rubric } : {}),
    };
    try {
      saveExam(exam);
      notify("Exam created.");
      go(`/exam/${exam.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create exam.",
      );
    }
  }
  return (
    <>
      <Header
        crumb="COMP10001 / Exams / Create exam"
        title="Create exam"
        subtitle="Create your exam now. Add its rubric whenever it is ready."
      />
      <div className="settings-grid">
        <Card
          title="Exam details"
          description="Only the exam name is required."
        >
          <form onSubmit={create}>
            <Field label="Exam name *">
              <input
                required
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Final exam 2025"
              />
            </Field>
            <Field label="Description (optional)">
              <textarea
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <RubricPicker onChange={setRubric} onBusy={setBusy} />
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button type="button" onClick={() => go("/exams")}>
                Cancel
              </Button>
              <Button variant="primary" disabled={busy}>
                {busy ? "Reading rubric…" : "Create exam"}
              </Button>
            </div>
          </form>
        </Card>
        <Card title="What happens next">
          <p>
            Open the exam to upload its answer CSV. You can upload or replace
            the rubric from the same exam page.
          </p>
          <Notice>
            Exam files stay in this browser tab, including across refreshes.
            They are not saved to a database.
          </Notice>
        </Card>
      </div>
    </>
  );
}

// The saved rubric remains visible until a replacement has been read and saved.
export function ExamFiles({ exam }: { exam: ExamRecord }) {
  const { saveExam, notify, isCoordinator } = useApp();
  const [replacement, setReplacement] = useState<ExamAttachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pickerKey, setPickerKey] = useState(0);
  function saveRubric() {
    if (!replacement || busy) return;
    try {
      saveExam({
        ...exam,
        rubric: replacement,
        rubricPages: {},
        ...(exam.sampleVersion
          ? { categories: {}, autoMarkedQuestionIds: [] }
          : {}),
      });
      setReplacement(null);
      setPickerKey((key) => key + 1);
      setError("");
      notify(
        exam.rubric
          ? "Rubric replaced. Existing answers and marks are unchanged."
          : "Rubric added.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save rubric.",
      );
    }
  }
  return (
    <>
      <div className="settings-grid exam-files">
        <Card title="Exam rubric" description="Optional Word or PDF document.">
          {exam.rubric ? (
            <div className="saved-attachment">
              <b className="attachment-name">{exam.rubric.name}</b>
              <p>
                {(exam.rubric.size / 1024).toFixed(1)} KB · Uploaded{" "}
                {new Date(exam.rubric.uploadedAt).toLocaleString()}
              </p>
              <a
                className="button"
                href={exam.rubric.dataUrl}
                download={exam.rubric.name}
              >
                Download rubric
              </a>
            </div>
          ) : (
            <p>No rubric uploaded. You can still upload answers.</p>
          )}
          {isCoordinator && (
            <RubricPicker
              key={pickerKey}
              onChange={setReplacement}
              onBusy={setBusy}
            />
          )}
          <p className="helper">
            The document is a reference. Replacing it does not change saved
            answers or marks. Page assignments are cleared when a rubric is
            replaced.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {isCoordinator && (
            <div className="form-actions">
              <Button disabled={!replacement || busy} onClick={saveRubric}>
                {busy
                  ? "Reading rubric…"
                  : exam.rubric
                    ? "Replace rubric"
                    : "Save rubric"}
              </Button>
            </div>
          )}
          {exam.rubric && !exam.rubric.pageCount && (
            <p className="notice">
              This older attachment has no page preview. The coordinator can
              upload it again to enable page assignments.
            </p>
          )}
        </Card>
        <Card title="Answer CSV" description={`Answers for ${exam.title}.`}>
          {exam.answers ? (
            <>
              <p className="attachment-name">
                <b>{exam.answers.name}</b>
              </p>
              <p>
                {exam.answers.preview.students.length} students ·{" "}
                {
                  exam.answers.preview.questions.filter((q) => !q.instruction)
                    .length
                }{" "}
                questions
              </p>
              <p>
                Uploaded {new Date(exam.answers.uploadedAt).toLocaleString()}
              </p>
              <Button onClick={() => go(`/exam/${exam.id}/answers`)}>
                View uploaded answers
              </Button>
            </>
          ) : (
            <p>No answer CSV uploaded yet.</p>
          )}
          {isCoordinator && (
            <div className="form-actions">
              <Button
                variant="primary"
                onClick={() => go(`/exam/${exam.id}/answers/upload`)}
              >
                Upload answer CSV
              </Button>
            </div>
          )}
          <p className="helper">
            CSV validation runs in Python. Review the file before saving it to
            this exam.
          </p>
        </Card>
      </div>
      {isCoordinator && !!exam.rubric?.pageCount && (
        <RubricPageMapping
          key={`${exam.id}-${exam.rubric.uploadedAt}`}
          exam={exam}
        />
      )}
    </>
  );
}

export function CreatedExam({ exam }: { exam: ExamRecord }) {
  const questions =
    exam.answers?.preview.questions.filter((q) => !q.instruction) ?? [];
  return (
    <>
      <Header
        crumb={`COMP10001 / Exams / ${exam.title}`}
        title={exam.title}
        subtitle={
          exam.description ||
          "Add a rubric and student answers to prepare this exam."
        }
        actions={<Button onClick={() => go("/exams")}>Back to exams</Button>}
      />
      <Notice>
        Saved in this browser tab. Rubric files are references; uploaded answers
        have not been marked.
      </Notice>
      <div className="stats-grid">
        <Stat
          label="Students"
          value={exam.answers?.preview.students.length ?? 0}
          detail="From this exam's CSV"
        />
        <Stat
          label="Questions"
          value={questions.length}
          detail="Excluding section introductions"
        />
        <Stat
          label="Rubric"
          value={exam.rubric ? "Uploaded" : "Optional"}
          detail={exam.rubric ? "Reference document" : "Can be added later"}
        />
      </div>
      <ExamFiles exam={exam} />
      {questions.length > 0 && (
        <Card title="Questions">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Canvas question ID</th>
                  <th>Question</th>
                  <th>Maximum mark</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id}>
                    <td>{q.id}</td>
                    <td className="exam-question-text">{q.text}</td>
                    <td>{q.maxMark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
