import { useMemo, useState } from 'react';
import type { ExamRecord } from '../../models/exams';
import { GRADE_BANDS, gradeDistribution } from '../../utils/gradeDistribution';
import { Button, Card, Field, Notice, Modal } from '../UI';

export function GradeDistribution({ exams }: { exams: ExamRecord[] }) {
  const available = exams.filter(exam => exam.answers);
  const [examId, setExamId] = useState(() => available.find(e => e.title === 'Final 2025')?.id ?? available[0]?.id ?? '');
  const exam = available.find(e => e.id === examId) ?? available[0];
  const [selected, setSelected] = useState('H1');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [studentId, setStudentId] = useState<string | null>(null);
  const students = useMemo(() => exam ? gradeDistribution(exam) : [], [exam]);
  const detailStudent = students.find(student => student.id === studentId);
  const questions = exam?.answers?.preview.questions.filter(question => !question.instruction) ?? [];
  const groups = GRADE_BANDS.map(band => ({ ...band, students: students.filter(s => s.band === band.id) }));
  const group = groups.find(g => g.id === selected)!;
  const matches = group.students.filter(s => s.id.toLowerCase().includes(search.toLowerCase()));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matches.length / 50) - 1));
  const completed = students.filter(s => s.percent !== null);
  const average = completed.length ? completed.reduce((sum, s) => sum + s.percent!, 0) / completed.length : null;
  const largest = Math.max(1, ...groups.map(g => g.students.length));
  return <Card title="Student mark distribution" description="Select a grade band to see its students. Totals use saved confirmed marks for every question.">
    {!exam ? <p>Upload student responses to an exam to see its mark distribution.</p> : <>
      <Field label="Distribution exam"><select value={exam.id} onChange={event => { setExamId(event.target.value); setStudentId(null); setPage(0); setSearch(''); }}>
        {available.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
      </select></Field>
      {exam.demoMarkDistribution && <Notice>Demo marks: these scores were generated to demonstrate the distribution and are not assessments of student answers.</Notice>}
      <p>{completed.length.toLocaleString()} of {students.length.toLocaleString()} students fully marked{average !== null ? ` · Average ${average.toFixed(1)}%` : ''}</p>
      <div className="grade-distribution" aria-label="Grade bands">
        {groups.map(g => <button key={g.id} className={`grade-band ${g.id === selected ? 'selected' : ''}`} aria-pressed={g.id === selected}
          aria-label={`${g.id}: ${g.students.length} students`} onClick={() => { setSelected(g.id); setSearch(''); setPage(0); }}>
          <strong>{g.students.length.toLocaleString()}</strong>
          <span className="grade-bar-space"><span style={{height:`${g.students.length / largest * 100}%`}} /></span>
          <b>{g.id}</b><small>{g.range}</small>
        </button>)}
      </div>
      <h3>{selected} · {group.students.length.toLocaleString()} students</h3>
      <Field label="Search students in grade band"><input type="search" placeholder="Student ID" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></Field>
      <div className="table-scroll grade-students"><table aria-label={`${selected} students`}><thead><tr><th>Student</th><th>Confirmed total</th><th>Percentage</th><th>Grade</th></tr></thead>
        <tbody>{matches.slice(currentPage * 50, (currentPage + 1) * 50).map(s => <tr key={s.id}><td><Button onClick={() => setStudentId(s.id)} aria-label={`View marks for ${s.id}`}>{s.id}</Button></td><td>{s.total.toFixed(2)} / {s.maximum}{s.percent === null && ` (${s.confirmed}/${s.questions} questions)`}</td><td>{s.percent === null ? 'Pending' : `${s.percent.toFixed(2)}%`}</td><td>{s.band}</td></tr>)}</tbody>
      </table></div>
      {!matches.length && <p>No students match this selection.</p>}
      {!!matches.length && <div className="group-pagination"><Button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous students</Button>
        <span>{currentPage * 50 + 1}–{Math.min(matches.length, (currentPage + 1) * 50)} of {matches.length.toLocaleString()}</span>
        <Button disabled={(currentPage + 1) * 50 >= matches.length} onClick={() => setPage(currentPage + 1)}>Next students</Button></div>}
      {detailStudent && <Modal title={`Marks for ${detailStudent.id}`} onClose={() => setStudentId(null)}>
        <p><strong>{exam.title}</strong> · {detailStudent.band}</p>
        <p>Confirmed total: <strong>{detailStudent.total.toFixed(2)} / {detailStudent.maximum}</strong>
          {detailStudent.percent === null ? ` · ${detailStudent.confirmed} of ${detailStudent.questions} questions marked` : ` · ${detailStudent.percent.toFixed(2)}%`}</p>
        {exam.demoMarkDistribution && <Notice>These are generated demo marks, not assessments of the student’s answers.</Notice>}
        <div className="table-scroll student-question-marks">
          <table aria-label={`Question marks for ${detailStudent.id}`}>
            <thead><tr><th>Question</th><th>Mark</th><th>Maximum</th></tr></thead>
            <tbody>{questions.map((question, index) => {
              const mark = exam.marks?.[question.id]?.[detailStudent.id];
              const confirmed = mark && mark.confirmedAt && Number.isFinite(mark.score) && mark.score >= 0 && mark.score <= question.maxMark;
              return <tr key={question.id}>
                <td><details><summary>Q{index + 1}</summary><p className="preserve">{question.text}</p></details></td>
                <td>{confirmed ? mark.score.toFixed(2) : 'Unmarked'}</td>
                <td>{question.maxMark}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <p className="helper">Only saved confirmed marks are shown. Expand a question to read its text.</p>
        <Button onClick={() => setStudentId(null)}>Close marks</Button>
      </Modal>}
    </>}
  </Card>;
}
