import { useState } from "react";
import type { ExamRecord } from "../../models/exams";
import { useApp, go } from "../../state";
import { Button, Card, Header, Notice, Stat, Field } from "../../components/UI";
import { RubricAccess } from "../../components/rubric/RubricWindow";
import { ExamFiles } from "./ExamSetup";
import { AiSuggestedFixes } from "../../components/marking/AiSuggestedFixes";
import { questionType, questionTypeLabel } from "../../models/questionTypes";
import { groupCategories, matchesCategory } from "../../utils/rubricScores";
import { RubricOptions } from "../../components/rubric/RubricOptions";
import { confirmSampleMark, confirmedResponseCount } from "../../utils/sampleMarking";

export function SampleExam({ exam }: { exam: ExamRecord }) {
  const rows =
    exam.answers?.preview.questions.filter((q) => !q.instruction) ?? [];
  const students = exam.answers?.preview.students ?? [];
  const manualQuestions = rows.filter(
    (q) => !exam.autoMarkedQuestionIds?.includes(q.id),
  );
  const marked = confirmedResponseCount(exam);
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
        description="Open any question to review the original answers and rubric score options."
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Question</th>
                <th>Prompt</th>
                <th>Maximum mark</th>
                <th>Classification</th>
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
                  <td>{questionTypeLabel(exam, q.id)}</td>
                  <td>
                    {exam.autoMarkedQuestionIds?.includes(q.id)
                      ? "Source-scored"
                      : `${Object.keys(exam.marks?.[q.id] ?? {}).length} / ${students.length}`}
                  </td>
                  <td>
                    <Button
                      onClick={() => go(`/exam/${exam.id}/question/${q.id}`)}
                    >
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
  const { saveExam, notify, isCoordinator } = useApp();
  const questions =
    exam.answers?.preview.questions.filter((q) => !q.instruction) ?? [];
  const question = questions.find((q) => q.id === questionId);
  const ordinal = questions.findIndex((q) => q.id === questionId) + 1;
  const students = exam.answers?.preview.students ?? [];
  const student = students.find((s) => s.id === studentId);
  const answer = student?.answers.find((a) => a.questionId === questionId);
  const saved = studentId ? exam.marks?.[questionId]?.[studentId] : undefined;
  const categories = groupCategories(exam.categories?.[questionId] ?? []);
  const automatic = exam.autoMarkedQuestionIds?.includes(questionId);
  const [categoryId, setCategoryId] = useState(saved?.categoryId ?? "");
  const category = categories.find((c) => matchesCategory(c, categoryId));
  const [comment, setComment] = useState(saved?.comment ?? "");
  const [error, setError] = useState("");
  if (!question || (studentId && !answer))
    return (
      <Card title="Response not found">
        <Button onClick={() => go(`/exam/${exam.id}`)}>Back to exam</Button>
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
            ? `/exam/${exam.id}/question/${questionId}/mark/${encodeURIComponent(remaining.id)}`
            : `/exam/${exam.id}/question/${questionId}`,
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
        subtitle={`Canvas question ${questionId} · ${question.maxMark} marks · ${questionTypeLabel(exam, questionId)}`}
        actions={
          <>
            <RubricAccess exam={exam} questionKey={`canvas:${questionId}`} />
            <Button
              onClick={() =>
                go(
                  studentId
                    ? `/exam/${exam.id}/question/${questionId}`
                    : `/exam/${exam.id}`,
                )
              }
            >
              {studentId ? "Back to question" : "Back to exam"}
            </Button>
          </>
        }
      />
      {!studentId && (
        <Card className="question-text-card" title="Question text">
          <p className="preserve">{question.text}</p>
        </Card>
      )}
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
                            `/exam/${exam.id}/question/${questionId}/mark/${encodeURIComponent(s.id)}`,
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
          {/* Keep the prompt and original response together beside the scoring panel. */}
          <div className="marking-answer-column">
            <Card className="question-text-card" title="Question text">
              <p className="preserve">{question.text}</p>
            </Card>
            <Card
              title="Original student response"
              description={`${studentId} · Read only`}
            >
              {!isCoordinator &&
                questionType(exam, questionId) === "coding" && (
                  <AiSuggestedFixes />
                )}
              <pre className="code-block" data-testid="sample-answer">
                {answer?.original || "(Blank response)"}
              </pre>
              <p className="helper">
                Source CSV score: {answer?.sourceScore || "—"}. This is not a
                mark confirmed in this workspace.
              </p>
            </Card>
            {/* Empty result panes are reserved for the future execution API. */}
            {["assignment-statement", "code-completion"].includes(
              questionType(exam, questionId),
            ) && (
              <Card title="Automated test result">
                <div className="automated-test-result">
                  <section aria-label="Student code execution">
                    <h3>Student code execution</h3>
                    <pre className="code-block" />
                  </section>
                  <section aria-label="Expected output">
                    <h3>Expected output</h3>
                    <pre className="code-block" />
                  </section>
                </div>
              </Card>
            )}
          </div>
          <Card className="mark-decision" title="Mark decision">
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
                <RubricOptions
                  options={categories}
                  maxMark={question.maxMark}
                  selected={categoryId}
                  onSelect={setCategoryId}
                />
                {category && (
                  <>
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
            {saved &&
              !categories.some(
                (c) =>
                  matchesCategory(c, saved.categoryId) &&
                  c.score === saved.score,
              ) && (
                <Notice>
                  The rubric has changed since this mark was saved. The saved
                  score is retained. Select a current option and confirm only
                  after reviewing the answer.
                  {saved.categoryDescription && (
                    <details>
                      <summary>Previously selected description</summary>
                      <p>{saved.categoryDescription}</p>
                    </details>
                  )}
                </Notice>
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
