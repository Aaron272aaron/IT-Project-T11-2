import { questions, type Answer } from "./domain";
import { examsFor, type ExamRegistry } from "./exams";
import { questionType } from "./questionTypes";
import type { AiReviewTask } from "../services/aiReviewQueue";

export function collectAiReviewTasks(
  registry: ExamRegistry,
  answers: Record<string, Answer[]>,
  workspaceIds: string[],
  pendingSampleWorkspace?: string,
): AiReviewTask[] {
  const tasks: AiReviewTask[] = [];
  for (const workspaceId of workspaceIds) {
    const exams = examsFor(registry, workspaceId);
    for (const exam of exams) {
      const coding = new Set(
        exam.answers?.preview.questions
          .filter(
            (question) =>
              !question.instruction &&
              questionType(exam, question.id) === "coding",
          )
          .map((question) => question.id),
      );
      for (const student of exam.answers?.preview.students ?? []) {
        for (const answer of student.answers) {
          if (!coding.has(answer.questionId) || !answer.original.trim())
            continue;
          tasks.push({
            workspaceId,
            responseKey: `${exam.id}/${student.id}`,
            questionKey: `canvas:${answer.questionId}`,
            code: answer.original,
          });
        }
      }
    }
    // The bundled sample replaces the old six-question demo when it loads.
    if (
      workspaceId === pendingSampleWorkspace ||
      exams.some((exam) => exam.id === "final" && exam.answers)
    )
      continue;
    for (const answer of answers[workspaceId] ?? []) {
      if (
        questions.find((question) => question.id === answer.question)?.kind !==
          "function" ||
        !answer.original.trim()
      )
        continue;
      tasks.push({
        workspaceId,
        responseKey: `demo/${answer.id}`,
        questionKey: `demo:${answer.question}`,
        code: answer.original,
      });
    }
  }
  return tasks;
}
