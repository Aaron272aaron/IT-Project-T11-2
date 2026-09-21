import { useState } from "react";
import { useApp, go } from "../state";
import { questions, download } from "../domain";
import {
  Header,
  Card,
  Button,
  Stat,
  Progress,
  Badge,
  Modal,
} from "../components/UI";
import Papa from "papaparse";
export function Dashboard({ list = false }: { list?: boolean }) {
  const { answers, workspace } = useApp();
  const marked = answers.filter((a) => a.mark !== undefined).length;
  const progress = answers.length
    ? Math.round((marked / answers.length) * 100)
    : 0;
  const students = new Set(answers.map((a) => a.id)).size;
  return (
    <>
      <Header
        crumb={`COMP10001 / ${list ? "Exams" : "Subject dashboard"}`}
        title={list ? "Exams" : "Subject dashboard"}
        subtitle={`${workspace.subject} · ${workspace.period}, ${workspace.year}`}
        actions={
          <Button variant="primary" onClick={() => go("/create-workspace")}>
            Create workspace
          </Button>
        }
      />
      <div className="stats-grid">
        <Stat
          label="Exams"
          value={workspace.id === "comp10001" ? 3 : 1}
          detail={
            workspace.id === "comp10001"
              ? "1 in progress · 1 complete · 1 draft"
              : "1 draft exam ready for responses"
          }
        />
        <Stat
          label="Students"
          value={students}
          detail="Enrolled in this subject"
        />
        <Stat
          label="Workspace members"
          value={workspace.members.length}
          detail={`${workspace.members.filter((m) => m.role === "Subject coordinator").length} coordinator · ${workspace.members.filter((m) => m.role === "Tutor").length} tutors`}
        />
      </div>
      <Card
        title="Exams"
        description="Open an exam to review questions and continue marking."
        className="table-card"
      >
        <div className="table-scroll">
          <table className="exam-table">
            <thead>
              <tr>
                <th>Exam</th>
                <th>Students</th>
                <th>Marking progress</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>Final exam</b>
                  <small>6 questions · 60 marks</small>
                </td>
                <td>{students || "—"}</td>
                <td>
                  <Progress value={progress} />
                </td>
                <td>
                  <span>
                    {progress === 100
                      ? "Complete"
                      : answers.length
                        ? "In progress"
                        : "Draft"}
                  </span>
                </td>
                <td>
                  <Button onClick={() => go("/exam/final")}>Open exam</Button>
                </td>
              </tr>
              {workspace.id === "comp10001" && (
                <>
                  <tr>
                    <td>
                      <b>Mid-semester test</b>
                      <small>4 questions · 30 marks</small>
                    </td>
                    <td>240</td>
                    <td>
                      <Progress value={100} />
                    </td>
                    <td className="success-text">Complete</td>
                    <td>
                      <Button onClick={() => go("/exam/midterm")}>
                        View exam
                      </Button>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <b>Practice exam</b>
                      <small>No responses imported</small>
                    </td>
                    <td>—</td>
                    <td>
                      <Progress value={0} />
                    </td>
                    <td>Draft</td>
                    <td>
                      <Button onClick={() => go("/exam/practice")}>
                        Open draft
                      </Button>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
        <p className="table-note">
          Progress counts saved final marks. Final marks are decided by a human
          marker.
        </p>
      </Card>
    </>
  );
}
export function Exam({ exam = "final" }: { exam?: string }) {
  const { answers, notify } = useApp();
  const [studentsOpen, setStudentsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const archive = exam === "midterm",
    draft = exam === "practice";
  const title = archive
    ? "Mid-semester test"
    : draft
      ? "Practice exam"
      : "Final exam";
  const rows = draft ? [] : answers;
  const studentIds = [...new Set(rows.map((a) => a.id))];
  const marked = archive
    ? rows.length
    : rows.filter((a) => a.mark !== undefined).length;
  const percent = rows.length ? Math.round((marked / rows.length) * 100) : 0;
  function exportMarks() {
    download(
      "final-exam-marks.csv",
      Papa.unparse(
        rows
          .filter((a) => a.mark !== undefined)
          .map((a) => ({
            student_id: a.id,
            question_id: a.question,
            mark: a.mark,
            comment: a.comment ?? "",
          })),
        { escapeFormulae: true },
      ),
    );
    notify("Confirmed marks exported.");
  }
  return (
    <>
      <Header
        crumb={`COMP10001 / Exams / ${title}`}
        title={title}
        subtitle="Review questions, monitor progress and continue marking."
        actions={
          <>
            <Button onClick={() => setStudentsOpen(true)}>
              View student list
            </Button>
            {!archive && !draft && (
              <Button variant="primary" onClick={() => go("/import")}>
                Import responses
              </Button>
            )}
          </>
        }
      />
      {(archive || draft) && (
        <div className="notice">
          {archive
            ? "Archived exam preview · This design uses sample summary data. The interactive marking workflow is available in Final exam."
            : "Draft preview · Open Final exam to try the complete import and marking workflow."}{" "}
          <a href="#/exam/final">Open Final exam →</a>
        </div>
      )}
      <Card title="Marking progress" className="exam-progress">
        <div className="progress-summary">
          <div>
            <strong>{percent}%</strong>
            <p>
              {marked.toLocaleString()} of {rows.length.toLocaleString()}{" "}
              responses marked
            </p>
          </div>
          <Progress value={percent} label={false} />
          <Badge tone={percent === 100 ? "success" : "info"}>
            {percent === 100
              ? "Complete"
              : rows.length
                ? "In progress"
                : "Draft"}
          </Badge>
        </div>
      </Card>
      <div className="stats-grid four">
        <Stat
          label="Students"
          value={studentIds.length}
          detail="Student submissions"
        />
        <Stat
          label="Questions"
          value={archive ? 4 : 6}
          detail="Across three question types"
        />
        <Stat
          label="Total marks"
          value={archive ? 30 : 60}
          detail="Final decision by a human"
        />
        <Stat
          label="Questions complete"
          value={
            questions.filter(
              (q) =>
                rows.some((a) => a.question === q.id) &&
                rows
                  .filter((a) => a.question === q.id)
                  .every((a) => a.mark !== undefined),
            ).length
          }
          detail="All responses marked"
        />
      </div>
      <Card
        title="Questions"
        description="Choose a question to review responses and mark answers."
        className="table-card"
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Question</th>
                <th>Type</th>
                <th>Marks</th>
                <th>Marking progress</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {questions.slice(0, archive ? 4 : 6).map((q) => {
                const qa = rows.filter((a) => a.question === q.id);
                const pct = qa.length
                  ? Math.round(
                      (qa.filter((a) => a.mark !== undefined).length /
                        qa.length) *
                        100,
                    )
                  : 0;
                return (
                  <tr key={q.id}>
                    <td>
                      <b>
                        Q{q.id} · {q.title}
                      </b>
                    </td>
                    <td>
                      <Badge>
                        {q.kind === "short"
                          ? "Short answer"
                          : q.kind === "function"
                            ? "Function + AI review"
                            : "Executable code"}
                      </Badge>
                    </td>
                    <td>{q.max}</td>
                    <td>
                      <Progress value={archive ? 100 : pct} />
                    </td>
                    <td>
                      <Button
                        disabled={archive || draft}
                        onClick={() => go(`/question/${q.id}`)}
                      >
                        Open question
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-note split">
          <span>
            Automated results support review. They do not save final marks.
          </span>
          <Button disabled={archive || draft || !marked} onClick={exportMarks}>
            Export confirmed marks
          </Button>
        </div>
      </Card>
      {studentsOpen && (
        <Modal title="Student list" onClose={() => setStudentsOpen(false)}>
          <input
            aria-label="Search students"
            placeholder="Search student ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="student-list">
            {studentIds
              .filter((id) => id.toLowerCase().includes(query.toLowerCase()))
              .map((id) => (
                <div key={id}>
                  <b>{id}</b>
                  <span>
                    {rows.filter((a) => a.id === id).length} responses
                  </span>
                </div>
              ))}
            {!studentIds.length && <p>No students imported yet.</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
