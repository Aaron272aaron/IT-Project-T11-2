-- Run as a script in DBeaver, connected to automark as automark_app.
-- Everything here is synthetic and rolls back; no rows remain afterward.
BEGIN;
DO $$
DECLARE tutor_id bigint;
DECLARE exam_id bigint;
DECLARE question_id bigint;
DECLARE submission_id bigint;
DECLARE answer_id bigint;
DECLARE saved_version bigint;
BEGIN
    INSERT INTO automark.tutors (name, email)
    VALUES ('Synthetic Demo Tutor', gen_random_uuid()::text || '@example.invalid')
    RETURNING id INTO tutor_id;
    INSERT INTO automark.assignments (name, course_code)
    VALUES ('Synthetic Demo Exam', 'TEST10001') RETURNING id INTO exam_id;
    INSERT INTO automark.questions
        (assignment_id, question_num, title, question_type, max_mark)
    VALUES (exam_id, 1, 'Return the input plus one', 'function', 10)
    RETURNING id INTO question_id;
    INSERT INTO automark.submissions (assignment_id, student_id)
    VALUES (exam_id, 90000001) RETURNING id INTO submission_id;
    INSERT INTO automark.answers
        (submission_id, question_id, assignment_id, question_type, raw_answer_text)
    VALUES (submission_id, question_id, exam_id, 'function',
            E'def answer(x):\n    return x + 1\n') RETURNING id INTO answer_id;
    ASSERT automark.claim_answer(answer_id, tutor_id);
    saved_version := automark.save_mark(answer_id, tutor_id, 10,
        'Synthetic human-confirmed feedback', 'finalised', 0);
    ASSERT saved_version = 1;
    PERFORM automark.release_answer(answer_id, tutor_id);
END;
$$;
SELECT am.* FROM automark.answer_marking am
JOIN automark.assignments exam ON exam.id = am.assignment_id
WHERE exam.name = 'Synthetic Demo Exam';
ROLLBACK;
