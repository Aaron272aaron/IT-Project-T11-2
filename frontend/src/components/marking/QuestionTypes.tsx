import { useState } from "react";
import type { ExamRecord } from "../../models/exams";
import {
  QUESTION_TYPES,
  questionType,
  type QuestionType,
} from "../../models/questionTypes";
import { useApp } from "../../state";
import { Card, Button, Notice } from "../UI";

// Classification is saved independently from scoring rules and confirmed marks.
export function QuestionTypes({ exam }: { exam: ExamRecord }) {
  const { isCoordinator, saveExam, notify } = useApp();
  const questions =
    exam.answers?.preview.questions.filter((q) => !q.instruction) ?? [];
  const saved = () =>
    Object.fromEntries(questions.map((q) => [q.id, questionType(exam, q.id)]));
  const [draft, setDraft] = useState<Record<string, QuestionType>>(saved);
  const [error, setError] = useState("");
  if (!isCoordinator) return null;
  function save() {
    try {
      saveExam({ ...exam, questionTypes: { ...draft } });
      setError("");
      notify("Question classifications saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Card className="question-types">
      <details>
        <summary>
          <strong>Question classifications</strong>
        </summary>
        {!questions.length ? (
          <Notice>
            Upload and save an answer CSV to classify its questions.
          </Notice>
        ) : (
          <>
            <p>Choose a type for each question.</p>
            <div className="table-scroll question-type-table">
              <table>
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Prompt</th>
                    <th>Classification</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q, i) => (
                    <tr key={q.id}>
                      <td>Q{i + 1}</td>
                      <td>
                        <details className="mapping-question">
                          <summary>
                            {q.text.replace(/\s+/g, " ").slice(0, 100)}
                          </summary>
                          <p className="preserve">{q.text}</p>
                        </details>
                      </td>
                      <td>
                        <select
                          aria-label={`Question ${i + 1} classification`}
                          value={draft[q.id]}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              [q.id]: e.target.value as QuestionType,
                            })
                          }
                        >
                          <option value="unassigned">Unassigned</option>
                          {QUESTION_TYPES.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              <Button variant="primary" onClick={save}>
                Save classifications
              </Button>
              <Button
                onClick={() => {
                  setDraft(saved());
                  setError("");
                }}
              >
                Discard classification changes
              </Button>
            </div>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </details>
    </Card>
  );
}
