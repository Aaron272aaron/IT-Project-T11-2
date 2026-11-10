import type { ExamRecord } from '../models/exams';
export const GRADE_BANDS = [
  { id: 'Fail', range: 'Below 50%', min: 0 },
  { id: 'Pass', range: '50–<65%', min: 50 },
  { id: 'H3', range: '65–<70%', min: 65 },
  { id: 'H2B', range: '70–<75%', min: 70 },
  { id: 'H2A', range: '75–<80%', min: 75 },
  { id: 'H1', range: '80–100%', min: 80 },
  { id: 'Pending', range: 'Marking incomplete', min: Infinity },
] as const;
export function gradeDistribution(exam: ExamRecord) {
  const questions = exam.answers?.preview.questions.filter(q => !q.instruction) ?? [];
  const maximum = questions.reduce((total, q) => total + Math.round(q.maxMark * 100), 0);
  return (exam.answers?.preview.students ?? []).map(student => {
    let earned = 0, confirmed = 0;
    for (const q of questions) {
      const mark = exam.marks?.[q.id]?.[student.id];
      if (mark && mark.confirmedAt && Number.isFinite(mark.score) && mark.score >= 0 && mark.score <= q.maxMark) {
        earned += Math.round(mark.score * 100);
        confirmed++;
      }
    }
    const complete = maximum > 0 && confirmed === questions.length;
    const percent = complete ? earned / maximum * 100 : null;
    const band = percent === null ? 'Pending' : [...GRADE_BANDS].reverse().find(b => percent >= b.min)!.id;
    return { id: student.id, total: earned / 100, maximum: maximum / 100, percent, band, confirmed, questions: questions.length };
  });
}
