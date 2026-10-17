import { useState } from "react";
import type { ExamRecord } from "../../models/exams";
import { useApp, go } from "../../state";
import {
  Button,
  Card,
  Header,
  Notice,
  Stat,
  Field,
  Badge,
} from "../../components/UI";
import { RubricAccess } from "../../components/rubric/RubricWindow";
import { ExamFiles } from "./ExamSetup";
import { AiSuggestedFixes } from "../../components/marking/AiSuggestedFixes";
import { AutomatedTests } from "../../components/marking/AutomatedTests";
import { AnswerGroups } from "../../components/marking/AnswerGroups";
import {
  questionType,
  questionTypeLabel,
  supportsAnswerGrouping,
} from "../../models/questionTypes";
import { groupCategories, matchesCategory } from "../../utils/rubricScores";
import { RubricOptions } from "../../components/rubric/RubricOptions";
import {
  confirmSampleMark,
  confirmedResponseCount,
} from "../../utils/sampleMarking";
import {
  questionLockOwner,
  submissionLockOwner,
} from "../../utils/submissionLocks";

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
        Open a question, then select a student to start marking. Tutors and
        coordinators use the same answers and confirmed marks. Source CSV scores
        remain separate from your confirmed marks.
      </Notice>
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
      <ExamFiles exam={exam} />
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
  const questionOwner = questionLockOwner(exam, questionId);
  const lockedBy =
    questionOwner ??
    (studentId ? submissionLockOwner(exam, questionId, studentId) : undefined);
  const lockedStudents = students.filter((s) =>
    submissionLockOwner(exam, questionId, s.id),
  );
  const categories = groupCategories(exam.categories?.[questionId] ?? []);
  const automatic = exam.autoMarkedQuestionIds?.includes(questionId);
  const coding = questionType(exam, questionId) === "coding";
  const grouping = supportsAnswerGrouping(questionType(exam, questionId));
  const [categoryId, setCategoryId] = useState(saved?.categoryId ?? "");
  const category = categories.find((c) => matchesCategory(c, categoryId));
  const [comment, setComment] = useState(saved?.comment ?? "");
  const [responseSearch, setResponseSearch] = useState("");
  const [responsePage, setResponsePage] = useState(0);
  const query = responseSearch.toLocaleLowerCase();
  const matchingStudents = students.filter(
    (student) =>
      student.id.toLocaleLowerCase().includes(query) ||
      (student.answers.find((a) => a.questionId === questionId)?.original ?? "")
        .toLocaleLowerCase()
        .includes(query),
  );
  const pageSize = 50;
  const page = Math.min(
    responsePage,
    Math.max(0, Math.ceil(matchingStudents.length / pageSize) - 1),
  );

  const [error, setError] = useState("");
  if (!question || (studentId && !answer))
    return (
      <Card title="Response not found">
        <Button onClick={() => go(`/exam/${exam.id}`)}>Back to exam</Button>
      </Card>
    );
  async function save(next: boolean) {
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
      await saveExam(updated);
      setError("");
      notify("Final mark saved for this response.");
      if (next) {
        const index = students.findIndex((s) => s.id === studentId);
        const remaining = [
          ...students.slice(index + 1),
          ...students.slice(0, index),
        ].find(
          (s) =>
            !updated.marks?.[questionId]?.[s.id] &&
            !submissionLockOwner(exam, questionId, s.id),
        );
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
      {questionOwner && (
        <Notice tone="warning">
          <Badge tone="warning">🔒 Question locked</Badge>
          <p>
            {questionOwner} is marking this question. All submissions are read
            only until the question is unlocked.
          </p>
          <Button onClick={() => go(`/exam/${exam.id}`)}>
            Choose another question
          </Button>
        </Notice>
      )}
      {!studentId && !grouping && lockedStudents.length > 0 && (
        <Notice tone="warning">
          <b>Submissions in progress</b>
          {lockedStudents.map((s) => (
            <div className="split" key={s.id}>
              <p>
                <Badge tone="warning">🔒 Locked</Badge> Student {s.id} · Being
                marked by {submissionLockOwner(exam, questionId, s.id)}
              </p>
              <Button
                onClick={() =>
                  go(
                    `/exam/${exam.id}/question/${questionId}/mark/${encodeURIComponent(s.id)}`,
                  )
                }
              >
                View {s.id}
              </Button>
            </div>
          ))}
          <p>Select another student to continue marking this question.</p>
        </Notice>
      )}
      {!studentId && (
        <Card className="question-text-card" title="Question text">
          <p className="preserve">{question.text}</p>
        </Card>
      )}
      {!studentId && grouping && (
        <AnswerGroups
          key={`${exam.id}/${questionId}/${questionType(exam, questionId)}`}
          exam={exam}
          questionId={questionId}
        />
      )}
      {!studentId ? (
        <Card title="Student responses">
          <Field label="Search student responses">
            <input
              type="search"
              value={responseSearch}
              placeholder="Student ID or response text"
              onChange={(event) => {
                setResponseSearch(event.target.value);
                setResponsePage(0);
              }}
            />
          </Field>
          <p role="status">
            {matchingStudents.length.toLocaleString()} of{" "}
            {students.length.toLocaleString()} responses
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Original response</th>
                  <th>Source CSV score</th>
                  <th>Confirmed mark</th>
                  {!grouping && <th>Submission access</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {matchingStudents
                  .slice(page * pageSize, (page + 1) * pageSize)
                  .map((s) => {
                    const owner = submissionLockOwner(exam, questionId, s.id);
                    return (
                      <tr key={s.id}>
                        <td>{s.id}</td>
                        <td>
                          <details>
                            <summary>View response</summary>
                            <pre className="preserve">
                              {s.answers.find(
                                (a) => a.questionId === questionId,
                              )?.original || "(Blank response)"}
                            </pre>
                          </details>
                        </td>
                        <td>
                          {s.answers.find((a) => a.questionId === questionId)
                            ?.sourceScore || "—"}
                        </td>
                        <td>
                          {exam.marks?.[questionId]?.[s.id]?.score ??
                            "Unmarked"}
                        </td>
                        {!grouping && (
                          <td>
                            <Badge tone={owner ? "warning" : "success"}>
                              {owner ? "🔒 Locked" : "Available"}
                            </Badge>
                            {owner && <small>Being marked by {owner}</small>}
                          </td>
                        )}
                        <td>
                          <Button
                            disabled={!!owner}
                            onClick={() =>
                              go(
                                `/exam/${exam.id}/question/${questionId}/mark/${encodeURIComponent(s.id)}`,
                              )
                            }
                          >
                            {questionOwner ? "View" : owner ? "Locked" : "Mark"}{" "}
                            {s.id}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {!matchingStudents.length && <p>No responses match your search.</p>}
          {matchingStudents.length > pageSize && (
            <div className="group-pagination">
              <Button
                disabled={page === 0}
                onClick={() => setResponsePage(page - 1)}
              >
                Previous responses
              </Button>
              <span>
                {page * pageSize + 1}–
                {Math.min(matchingStudents.length, (page + 1) * pageSize)} of{" "}
                {matchingStudents.length}
              </span>
              <Button
                disabled={(page + 1) * pageSize >= matchingStudents.length}
                onClick={() => setResponsePage(page + 1)}
              >
                Next responses
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="marking-grid">
          {/* Keep the prompt and original response together beside the scoring panel. */}
          <div className="marking-answer-column">
            <Card className="question-text-card" title="Question text">
              <p className="preserve">{question.text}</p>
            </Card>
            <Card
              title={
                coding ? "Original student code" : "Original student response"
              }
              description={`${studentId} · Read only`}
            >
              <pre className="code-block" data-testid="sample-answer">
                {answer?.original || "(Blank response)"}
              </pre>
              {coding && (
                <AiSuggestedFixes
                  key={`${exam.id}/${questionId}/${studentId}/${answer?.original}`}
                  responseKey={`${exam.id}/${studentId}`}
                  code={answer?.original ?? ""}
                  questionKey={`canvas:${questionId}`}
                />
              )}
              <p className="helper">
                Source CSV score: {answer?.sourceScore || "—"}. This is not a
                mark confirmed in this workspace.
              </p>
            </Card>
            {!grouping && (
              <Card title="Answer checks and test results">
                <AutomatedTests
                  questionKey={`canvas:${questionId}`}
                  code={answer?.original ?? ""}
                />
              </Card>
            )}
          </div>
          <Card className="mark-decision" title="Mark decision">
            {lockedBy ? (
              <Notice tone="warning">
                <Badge tone="warning">🔒 Locked</Badge>
                <p>
                  {questionOwner
                    ? `${questionOwner} is marking this question. All submissions are read only.`
                    : `${lockedBy} is marking ${studentId}'s response to this question. Return to the question to mark another student.`}
                </p>
              </Notice>
            ) : automatic ? (
              <Notice>
                This section uses the original CSV score for review.
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
                disabled={!!lockedBy}
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
            {!automatic && !lockedBy && (
              <div className="form-actions">
                {grouping && (
                  <Button
                    variant="primary"
                    disabled={!categories.length}
                    onClick={() => save(false)}
                  >
                    Confirm category &amp; mark
                  </Button>
                )}
                <Button
                  variant={grouping ? "" : "primary"}
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
