-- Synthetic integration fixtures; manage.py applies this only in a new test DB.
BEGIN;
INSERT INTO automark.tutors (name, email) VALUES
    ('Synthetic Coordinator', 'coordinator@example.invalid'),
    ('Synthetic Tutor', 'tutor@example.invalid');
INSERT INTO automark.assignments (name, course_code) VALUES
    ('Synthetic Exam A', 'TEST10001'), ('Synthetic Exam B', 'TEST10001');
INSERT INTO automark.questions
    (assignment_id, question_num, title, question_type, max_mark) VALUES
    (1, 1, 'Question 1', 'function', 10),
    (1, 2, 'Question 2', 'short_answer', 5),
    (2, 1, 'Question 1', 'function', 10);
INSERT INTO automark.submissions (assignment_id, student_id) VALUES
    (1, 90000001), (2, 90000002), (1, 90000003);
INSERT INTO automark.answers
    (submission_id, question_id, assignment_id, raw_answer_text, question_type)
VALUES (1, 1, 1, E'def answer():\n    return 1  \n', 'function'),
       (1, 2, 1, 'Synthetic short answer', 'short_answer'),
       (2, 3, 2, E'def answer():\n    return 2\n', 'function');
INSERT INTO automark.answer_groups (question_id, group_key) VALUES
    (2, 'synthetic_group'), (1, 'synthetic_other_question');
INSERT INTO automark.answer_group_members
    (answer_group_id, answer_id, question_id) VALUES (1, 2, 2);

DO $$
BEGIN
    ASSERT (SELECT count(*) FROM automark.questions WHERE question_num = 1) = 2,
        'Two exams must both support question 1';
    ASSERT (SELECT raw_answer_text FROM automark.answers WHERE id = 1)
        = E'def answer():\n    return 1  \n', 'Code whitespace must be preserved';
    ASSERT (SELECT marking_status FROM automark.answer_marking WHERE answer_id = 1)
        = 'unmarked', 'New answers must start unmarked';
    BEGIN
        INSERT INTO automark.answers
            (submission_id, question_id, assignment_id, raw_answer_text, question_type)
        VALUES (1, 3, 1, 'Synthetic mismatch', 'function');
        RAISE EXCEPTION 'FAIL: cross-exam answer accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO automark.answers
            (submission_id, question_id, assignment_id, raw_answer_text, question_type)
        VALUES (3, 1, 1, 'Synthetic mismatch', 'short_answer');
        RAISE EXCEPTION 'FAIL: question type mismatch accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        UPDATE automark.answers SET raw_answer_text = 'Changed' WHERE id = 1;
        RAISE EXCEPTION 'FAIL: original answer edit accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO automark.answer_group_members
            (answer_group_id, answer_id, question_id) VALUES (2, 3, 3);
        RAISE EXCEPTION 'FAIL: cross-question group accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO automark.answers
            (submission_id, question_id, assignment_id, raw_answer_text, question_type)
        VALUES (1, 1, 1, 'Duplicate', 'function');
        RAISE EXCEPTION 'FAIL: duplicate answer accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    RAISE NOTICE 'PASS: question numbering, originals, foreign keys, grouping, duplicates';
END;
$$;

SET LOCAL ROLE automark_app;
DO $$
BEGIN
    ASSERT automark.claim_answer(1, 1), 'First tutor must claim an answer';
    ASSERT NOT automark.claim_answer(1, 2), 'Second tutor must be locked out';
    ASSERT NOT automark.claim_answer(1, NULL), 'Null tutor must not acquire a lock';
    ASSERT NOT automark.release_answer(1, 2), 'Second tutor must not unlock it';
    ASSERT automark.save_mark(1, 1, 7.5, 'Synthetic feedback', 'draft', 0) = 1;
    ASSERT (SELECT count(*) FROM automark.mark_history WHERE answer_id = 1) = 1;
    BEGIN
        PERFORM automark.save_mark(1, 1, 8, 'Stale', 'draft', 0);
        RAISE EXCEPTION 'FAIL: stale mark accepted';
    EXCEPTION WHEN serialization_failure THEN NULL;
    END;
    BEGIN
        PERFORM automark.save_mark(1, 1, 11, 'Too high', 'finalised', 1);
        RAISE EXCEPTION 'FAIL: above-maximum mark accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        PERFORM automark.save_mark(1, 1, -1, 'Negative', 'draft', 1);
        RAISE EXCEPTION 'FAIL: negative mark accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        PERFORM automark.save_mark(1, 1, NULL, 'No mark', 'finalised', 1);
        RAISE EXCEPTION 'FAIL: finalised null mark accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    ASSERT automark.save_mark(1, 1, 8.5, 'Reviewed', 'finalised', 1) = 2;
    ASSERT (SELECT count(*) FROM automark.mark_history WHERE answer_id = 1) = 2;
    ASSERT (SELECT mark FROM automark.final_marks WHERE student_id = 90000001) = 8.5;
    BEGIN
        UPDATE automark.questions SET max_mark = 8 WHERE id = 1;
        RAISE EXCEPTION 'FAIL: maximum below recorded mark accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE automark.mark_history SET notes = 'Changed';
        RAISE EXCEPTION 'FAIL: audit history edit accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    ASSERT automark.release_answer(1, 1);
    BEGIN
        PERFORM automark.save_mark(1, 1, 9, 'Without lock', 'draft', 2);
        RAISE EXCEPTION 'FAIL: unlocked save accepted';
    EXCEPTION WHEN lock_not_available THEN NULL;
    END;
    RAISE NOTICE 'PASS: human saves, version conflicts, bounds, audit history, locks';
END;
$$;
RESET ROLE;

-- A lease expires after a crashed client, allowing another tutor to take over.
UPDATE automark.answers SET locked_by = 1,
    locked_until = now() - interval '1 minute' WHERE id = 1;
SET LOCAL ROLE automark_app;
DO $$
BEGIN
    ASSERT automark.claim_answer(1, 2), 'Expired lease must be reclaimable';
    ASSERT automark.release_answer(1, 2);
END;
$$;
RESET ROLE;

SET LOCAL ROLE automark_worker;
INSERT INTO automark.ai_reviews (answer_id, model_name, corrected_code, explanation)
VALUES (1, 'synthetic-local-model', 'Synthetic corrected code', 'Synthetic fix');
INSERT INTO automark.automated_results (answer_id, status, marks_earned, report)
VALUES (1, 'completed', 10, '{"synthetic": true, "passed": 2}'::jsonb);
INSERT INTO automark.automated_results
    (answer_id, ai_review_id, status, marks_earned, report)
VALUES (1, 1, 'completed', 10, '{"synthetic": true, "corrected": true}'::jsonb);
DO $$
BEGIN
    BEGIN
        INSERT INTO automark.marks (answer_id, marked_by, mark, status)
        VALUES (2, 1, 5, 'finalised');
        RAISE EXCEPTION 'FAIL: worker assigned a human mark';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        PERFORM automark.save_mark(2, 1, 5, 'Automated', 'finalised', 0);
        RAISE EXCEPTION 'FAIL: worker invoked human save';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        INSERT INTO automark.ai_reviews
            (answer_id, model_name, decision, reviewed_by, reviewed_at)
        VALUES (1, 'synthetic', 'accepted', 1, now());
        RAISE EXCEPTION 'FAIL: worker pretended to approve an AI suggestion';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        INSERT INTO automark.automated_results
            (answer_id, ai_review_id, status) VALUES (3, 1, 'completed');
        RAISE EXCEPTION 'FAIL: wrong-answer AI result accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO automark.automated_results
            (answer_id, status, marks_earned) VALUES (1, 'runner_error', 0);
        RAISE EXCEPTION 'FAIL: runner error represented as zero mark';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    RAISE NOTICE 'PASS: automated results, AI references, worker permissions, runner errors';
END;
$$;
RESET ROLE;
DO $$
BEGIN
    ASSERT (SELECT mark FROM automark.marks WHERE answer_id = 1) = 8.5,
        'Automated recommendations must not overwrite the human mark';
    ASSERT (SELECT count(*) FROM automark.marks WHERE answer_id = 2) = 0;
END;
$$;
COMMIT;
