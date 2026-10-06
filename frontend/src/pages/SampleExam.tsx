import { useState } from "react";
import type { ExamRecord } from "../exams";
import { useApp, go } from "../state";
import { Button, Card, Header, Notice, Stat, Field } from "../components/UI";
import { RubricAccess } from "../components/RubricWindow";
import { ExamFiles } from "./ExamSetup";
import { confirmSampleMark } from "../sampleMarking";

export function SampleExam({ exam }: { exam: ExamRecord }) {
  const rows =
    exam.answers?.preview.questions.filter((q) => !q.instruction) ?? [];
  const students = exam.answers?.preview.students ?? [];
  const manualQuestions = rows.filter(
    (q) => !exam.autoMarkedQuestionIds?.includes(q.id),
  );
  const marked = Object.values(exam.marks ?? {}).reduce(
    (n, records) => n + Object.keys(records).length,
    0,
  );
  return (
    <>
      <Header
        title={exam.title}
        crumb={`COMP10001 / Exams / ${exam.title}`}
        subtitle={exam.description}
        actions={<Button onClick={() => go("/exams")}>Back to exams</Button>}
      />
      <div className="stats-grid">
        <Stat
          label="Students"
          value={students.length}
          detail="From the supplied CSV"
        />
        <Stat
          label="Questions"
          value={rows.length}
          detail="Introduction sections excluded"
        />
        <Stat
          label="Marked responses"
          value={`${marked} / ${manualQuestions.length * students.length}`}
          detail="Human-confirmed · Automatic section excluded"
        />
      </div>
      <Notice>
        Switch Demo perspective to Tutor, open a question, then select a
        student. Source CSV scores remain separate from your confirmed marks.
      </Notice>
      <ExamFiles exam={exam} />
      <Card
        title="Questions"
        description="Open any question to review the original answers and its assigned rubric pages."
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Question</th>
                <th>Prompt</th>
                <th>Maximum mark</th>
                <th>Marked</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((q, i) => (
                <tr key={q.id}>
                  <td>
                    Q{i + 1}
                    <small>{q.id}</small>
                  </td>
                  <td>
                    <details className="mapping-question">
                      <summary>
                        {q.text.replace(/\s+/g, " ").slice(0, 110)}
                        {q.text.length > 110 ? "…" : ""}
                      </summary>
                      <p className="preserve">{q.text}</p>
                    </details>
                  </td>
                  <td>{q.maxMark}</td>
                  <td>
                    {exam.autoMarkedQuestionIds?.includes(q.id)
                      ? "Source-scored"
                      : `${Object.keys(exam.marks?.[q.id] ?? {}).length} / ${students.length}`}
                  </td>
                  <td>
                    <Button onClick={() => go(`/exam/final/question/${q.id}`)}>
                      Open question {i + 1}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

export function SampleQuestion({
  exam,
  questionId,
  studentId,
}: {
  exam: ExamRecord;
  questionId: string;
  studentId?: string;
}) {
  const { saveExam, notify } = useApp();
  const questions =
    exam.answers?.preview.questions.filter((q) => !q.instruction) ?? [];
  const question = questions.find((q) => q.id === questionId);
  const ordinal = questions.findIndex((q) => q.id === questionId) + 1;
  const students = exam.answers?.preview.students ?? [];
  const student = students.find((s) => s.id === studentId);
  const answer = student?.answers.find((a) => a.questionId === questionId);
  const saved = studentId ? exam.marks?.[questionId]?.[studentId] : undefined;
  const categories = exam.categories?.[questionId] ?? [];
  const automatic = exam.autoMarkedQuestionIds?.includes(questionId);
  const [categoryId, setCategoryId] = useState(saved?.categoryId ?? "");
  const category = categories.find((c) => c.id === categoryId);
  const [comment, setComment] = useState(saved?.comment ?? "");
  const [error, setError] = useState("");
  if (!question || (studentId && !answer))
    return (
      <Card title="Response not found">
        <Button onClick={() => go("/exam/final")}>Back to exam</Button>
      </Card>
    );
  function save(next: boolean) {
    try {
      if (!categoryId)
        throw new Error(
          "Choose a rubric category after checking the document.",
        );
      const updated = confirmSampleMark(
        exam,
        questionId,
        studentId!,
        categoryId,
        comment,
      );
      saveExam(updated);
      setError("");
      notify("Final mark saved for this response.");
      if (next) {
        const index = students.findIndex((s) => s.id === studentId);
        const remaining = [
          ...students.slice(index + 1),
          ...students.slice(0, index),
        ].find((s) => !updated.marks?.[questionId]?.[s.id]);
        go(
          remaining
            ? `/exam/final/question/${questionId}/mark/${encodeURIComponent(remaining.id)}`
            : `/exam/final/question/${questionId}`,
        );
      }
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <>
      <Header
        title={`${studentId ? "Mark " : ""}Question ${ordinal}`}
        crumb={`COMP10001 / ${exam.title} / Question ${ordinal}`}
        subtitle={`Canvas question ${questionId} · ${question.maxMark} marks`}
        actions={
          <>
            <RubricAccess exam={exam} questionKey={`canvas:${questionId}`} />
            <Button
              onClick={() =>
                go(
                  studentId
                    ? `/exam/final/question/${questionId}`
                    : "/exam/final",
                )
              }
            >
              {studentId ? "Back to question" : "Back to exam"}
            </Button>
          </>
        }
      />
      <Card title="Question text">
        <p className="preserve">{question.text}</p>
      </Card>
      {!studentId ? (
        <Card title="Student responses">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Source CSV score</th>
                  <th>Confirmed mark</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>
                      {s.answers.find((a) => a.questionId === questionId)
                        ?.sourceScore || "—"}
                    </td>
                    <td>
                      {exam.marks?.[questionId]?.[s.id]?.score ?? "Unmarked"}
                    </td>
                    <td>
                      <Button
                        onClick={() =>
                          go(
                            `/exam/final/question/${questionId}/mark/${encodeURIComponent(s.id)}`,
                          )
                        }
                      >
                        Mark {s.id}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="marking-grid">
          <Card
            title="Original student response"
            description={`${studentId} · Read only`}
          >
            <pre className="code-block" data-testid="sample-answer">
              {answer?.original || "(Blank response)"}
            </pre>
            <p className="helper">
              Source CSV score: {answer?.sourceScore || "—"}. This is not a mark
              confirmed in this workspace.
            </p>
          </Card>
          <Card
            title="Human decision"
            description="Check the assigned rubric before confirming a score for the whole answer."
          >
            <p className="helper">
              Use the document's categories and award the corresponding total.
              No automatic marking or code execution is performed.
            </p>
            {automatic ? (
              <Notice>
                This section is identified as automatically marked in the
                supplied rubric. Its original CSV score is shown for review;
                this prototype does not rerun automatic marking.
              </Notice>
            ) : (
              <>
                {!categories.length && (
                  <Notice>
                    No categories are configured for this rubric. Original
                    answers remain available for review.
                  </Notice>
                )}
                <Field label="Rubric category">
                  <select
                    aria-label="Rubric category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">Choose a category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.score} / {question.maxMark} ·{" "}
                        {c.description.slice(0, 100)}
                      </option>
                    ))}
                  </select>
                </Field>
                {category && (
                  <>
                    <p>{category.description}</p>
                    <p>
                      <b>
                        Final score: {category.score} / {question.maxMark}
                      </b>
                    </p>
                  </>
                )}
              </>
            )}
            <Field label="Marker comment (optional)">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </Field>
            {saved && (
              <p>
                Saved mark: {saved.score} / {question.maxMark}
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {!automatic && (
              <div className="form-actions">
                <Button
                  variant="primary"
                  disabled={!categories.length}
                  onClick={() => save(false)}
                >
                  Confirm category &amp; mark
                </Button>
                <Button
                  disabled={!categories.length}
                  onClick={() => save(true)}
                >
                  Confirm and next response
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
