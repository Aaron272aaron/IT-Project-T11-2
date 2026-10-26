import { isDemoSession } from "../../api/auth";
import { loadExampleData } from "../../demo/examples";
import { useState, type FormEvent } from "react";
import { useApp, go } from "../../state";
import type { ExamAttachment, ExamRecord } from "../../models/exams";
import { Header, Card, Button, Field, Notice, Stat } from "../../components/UI";
import { QuestionTypes } from "../../components/marking/QuestionTypes";
import { questionTypeLabel } from "../../models/questionTypes";
import { RubricEditor } from "../../components/rubric/RubricEditor";
import { RubricPicker } from "../../components/rubric/RubricPicker";

export function CreateExam() {
  const { saveExam, notify, exams } = useApp();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [example, setExample] = useState<ExamRecord | null>(null);
  const [loadingExample, setLoadingExample] = useState(false);
  const [rubric, setRubric] = useState<ExamAttachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function useExampleAnswers() {
    setLoadingExample(true);
    setError("");
    try {
      setExample(await loadExampleData());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load example answers.",
      );
    } finally {
      setLoadingExample(false);
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || loadingExample || !title.trim()) return;
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
      // Copy the questions and classifications, never the sample's saved marks.
      ...(example
        ? {
            answers: {
              ...example.answers!,
              uploadedAt: new Date().toISOString(),
            },
            questionTypes: example.questionTypes,
          }
        : {}),
    };
    try {
      await saveExam(exam);
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
      />
      <div className="settings-grid">
        <Card
          title="Exam details"
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
            {isDemoSession() && (
              <fieldset>
                <legend>Answer CSV (optional)</legend>
                <p>
                  Start with the example student answers, or upload your own CSV
                  after creating the exam.
                </p>
                <Button
                  type="button"
                  disabled={loadingExample}
                  onClick={() => void useExampleAnswers()}
                >
                  {loadingExample ? "Loading example…" : "Use example data"}
                </Button>
                {example && (
                  <p role="status">
                    {example.answers!.preview.students.length} students ·{" "}
                    {
                      example.answers!.preview.questions.filter(
                        (q) => !q.instruction,
                      ).length
                    }{" "}
                    questions selected{" "}
                    <Button type="button" onClick={() => setExample(null)}>
                      Remove example answers
                    </Button>
                  </p>
                )}
              </fieldset>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button type="button" onClick={() => go("/exams")}>
                Cancel
              </Button>
              <Button variant="primary" disabled={busy || loadingExample}>
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
            Exam files and confirmed marks are saved to this workspace.
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
  async function saveRubric() {
    if (!replacement || busy) return;
    try {
      await saveExam({
        ...exam,
        rubric: replacement,
        rubricPages: {},

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
            Review the answer preview before saving it to this exam.
          </p>
        </Card>
      </div>
      {isCoordinator && (
        <QuestionTypes
          key={`types-${exam.id}-${exam.answers?.uploadedAt}`}
          exam={exam}
        />
      )}
      {isCoordinator && (
        <RubricEditor
          key={`options-${exam.id}-${exam.answers?.uploadedAt}-${exam.rubric?.uploadedAt}`}
          exam={exam}
          exampleRubric={replacement?.exampleCategories ? replacement : undefined}
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
        Open a question to review answers and confirm marks. Tutors and
        coordinators use the same marking workspace.
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
      {questions.length > 0 && (
        <Card title="Questions">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Canvas question ID</th>
                  <th>Question</th>
                  <th>Maximum mark</th>
                  <th>Classification</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id}>
                    <td>{q.id}</td>
                    <td className="exam-question-text">{q.text}</td>
                    <td>{q.maxMark}</td>
                    <td>{questionTypeLabel(exam, q.id)}</td>
                    <td>
                      <Button
                        onClick={() => go(`/exam/${exam.id}/question/${q.id}`)}
                      >
                        Open question {questions.indexOf(q) + 1}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <ExamFiles exam={exam} />
    </>
  );
}
