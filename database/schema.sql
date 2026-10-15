-- Task 39: PostgreSQL adaptation of Confluence Database Model, page 7274651 v1.
-- See README.md for the diagram's ambiguous keys and implementation additions.
-- Apply once to an empty database; the transaction prevents a partial schema.
BEGIN;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA automark;

CREATE TYPE automark.question_type AS ENUM ('short_answer', 'code', 'function');
CREATE TYPE automark.marking_status AS ENUM ('unmarked', 'draft', 'finalised');
CREATE TYPE automark.run_status AS ENUM
    ('queued', 'running', 'completed', 'runner_error');
CREATE TYPE automark.review_decision AS ENUM ('pending', 'accepted', 'rejected');

CREATE TABLE automark.tutors (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name varchar(255) NOT NULL CHECK (btrim(name) <> ''),
    email varchar(255) NOT NULL CHECK (btrim(email) <> ''),
    coordinator_id bigint REFERENCES automark.tutors(id),
    CHECK (coordinator_id IS DISTINCT FROM id)
);
CREATE UNIQUE INDEX tutors_email_unique ON automark.tutors (lower(email));
CREATE INDEX tutors_coordinator_idx ON automark.tutors (coordinator_id);

CREATE TABLE automark.assignments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name varchar(255) NOT NULL CHECK (btrim(name) <> ''),
    course_code varchar(32) NOT NULL CHECK (btrim(course_code) <> ''),
    date timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE automark.questions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question_num bigint NOT NULL CHECK (question_num > 0),
    assignment_id bigint NOT NULL REFERENCES automark.assignments(id),
    title varchar(255) NOT NULL,
    question_type automark.question_type NOT NULL,
    max_mark numeric(6,2) NOT NULL CHECK (max_mark >= 0),
    rubric_text text,
    test_cases jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(test_cases) = 'array'),
    UNIQUE (assignment_id, question_num),
    UNIQUE (id, assignment_id),
    UNIQUE (id, question_type)
);

CREATE TABLE automark.submissions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    assignment_id bigint NOT NULL REFERENCES automark.assignments(id),
    student_id bigint NOT NULL CHECK (student_id > 0),
    submitted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (assignment_id, student_id),
    UNIQUE (id, assignment_id)
);

CREATE TABLE automark.answers (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    submission_id bigint NOT NULL,
    question_id bigint NOT NULL,
    assignment_id bigint NOT NULL,
    raw_answer_text text NOT NULL,
    question_type automark.question_type NOT NULL,
    locked_by bigint REFERENCES automark.tutors(id),
    locked_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (submission_id, question_id),
    UNIQUE (id, question_id),
    CHECK ((locked_by IS NULL) = (locked_until IS NULL)),
    FOREIGN KEY (submission_id, assignment_id)
        REFERENCES automark.submissions(id, assignment_id),
    FOREIGN KEY (question_id, assignment_id)
        REFERENCES automark.questions(id, assignment_id),
    FOREIGN KEY (question_id, question_type)
        REFERENCES automark.questions(id, question_type)
);
CREATE INDEX answers_question_idx ON automark.answers (question_id);
CREATE INDEX answers_locked_by_idx ON automark.answers (locked_by);

CREATE TABLE automark.marks (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    answer_id bigint NOT NULL UNIQUE REFERENCES automark.answers(id),
    marked_by bigint NOT NULL REFERENCES automark.tutors(id),
    mark numeric(6,2) CHECK (mark >= 0),
    notes text,
    status automark.marking_status NOT NULL DEFAULT 'draft',
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'unmarked'),
    CHECK (status <> 'finalised' OR mark IS NOT NULL)
);
CREATE INDEX marks_marked_by_idx ON automark.marks (marked_by);

CREATE TABLE automark.answer_groups (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question_id bigint NOT NULL REFERENCES automark.questions(id),
    group_key varchar(64) NOT NULL CHECK (btrim(group_key) <> ''),
    suggested_mark numeric(6,2) CHECK (suggested_mark >= 0),
    UNIQUE (question_id, group_key),
    UNIQUE (id, question_id)
);

CREATE TABLE automark.answer_group_members (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    answer_group_id bigint NOT NULL,
    answer_id bigint NOT NULL UNIQUE,
    question_id bigint NOT NULL,
    UNIQUE (id, answer_id),
    FOREIGN KEY (answer_group_id, question_id)
        REFERENCES automark.answer_groups(id, question_id),
    FOREIGN KEY (answer_id, question_id)
        REFERENCES automark.answers(id, question_id)
);
CREATE INDEX group_members_group_idx
    ON automark.answer_group_members (answer_group_id);

CREATE TABLE automark.ai_reviews (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    answer_id bigint NOT NULL REFERENCES automark.answers(id),
    generated_at timestamptz NOT NULL DEFAULT now(),
    answer_group_members_id bigint,
    model_name text NOT NULL,
    corrected_code text,
    explanation text,
    suggested_mark numeric(6,2) CHECK (suggested_mark >= 0),
    decision automark.review_decision NOT NULL DEFAULT 'pending',
    reviewed_by bigint REFERENCES automark.tutors(id),
    reviewed_at timestamptz,
    UNIQUE (id, answer_id),
    FOREIGN KEY (answer_group_members_id, answer_id)
        REFERENCES automark.answer_group_members(id, answer_id),
    CHECK ((decision = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
        OR (decision <> 'pending' AND reviewed_by IS NOT NULL
            AND reviewed_at IS NOT NULL))
);
CREATE INDEX ai_reviews_answer_idx ON automark.ai_reviews (answer_id);
CREATE INDEX ai_reviews_member_idx
    ON automark.ai_reviews (answer_group_members_id);

CREATE TABLE automark.automated_results (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    answer_id bigint NOT NULL REFERENCES automark.answers(id),
    status automark.run_status NOT NULL DEFAULT 'queued',
    summary text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    run_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    ai_review_id bigint,
    report jsonb,
    marks_earned numeric(6,2) CHECK (marks_earned >= 0),
    error_code text,
    FOREIGN KEY (ai_review_id, answer_id)
        REFERENCES automark.ai_reviews(id, answer_id),
    CHECK (status <> 'runner_error' OR marks_earned IS NULL)
);
CREATE INDEX automated_results_answer_idx
    ON automark.automated_results (answer_id, created_at DESC);
CREATE INDEX automated_results_review_idx
    ON automark.automated_results (ai_review_id);

-- Append-only snapshots retain human changes without replacing earlier marks.
CREATE TABLE automark.mark_history (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mark_id bigint NOT NULL REFERENCES automark.marks(id),
    answer_id bigint NOT NULL REFERENCES automark.answers(id),
    marked_by bigint NOT NULL REFERENCES automark.tutors(id),
    mark numeric(6,2),
    notes text,
    status automark.marking_status NOT NULL,
    version bigint NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (mark_id, version)
);
CREATE INDEX mark_history_answer_idx
    ON automark.mark_history (answer_id, changed_at);

CREATE FUNCTION automark.preserve_original_answer() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, automark AS $$
BEGIN
    IF ROW(NEW.raw_answer_text, NEW.submission_id, NEW.question_id,
           NEW.assignment_id, NEW.question_type)
        IS DISTINCT FROM
       ROW(OLD.raw_answer_text, OLD.submission_id, OLD.question_id,
           OLD.assignment_id, OLD.question_type) THEN
        RAISE EXCEPTION 'Imported answers cannot be edited in place'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_original_answer BEFORE UPDATE ON automark.answers
FOR EACH ROW EXECUTE FUNCTION automark.preserve_original_answer();

CREATE FUNCTION automark.validate_human_mark() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, automark AS $$
DECLARE maximum numeric;
BEGIN
    -- Lock the rubric row so a concurrent maximum change cannot invalidate a mark.
    SELECT q.max_mark INTO maximum FROM automark.questions q
    JOIN automark.answers a ON a.question_id = q.id
    WHERE a.id = NEW.answer_id FOR SHARE OF q;
    IF NEW.mark > maximum THEN
        RAISE EXCEPTION 'Mark exceeds the question maximum'
            USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.answer_id <> OLD.answer_id THEN
            RAISE EXCEPTION 'A mark cannot be moved to another answer'
                USING ERRCODE = '23514';
        END IF;
        NEW.version := OLD.version + 1;
    END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_human_mark BEFORE INSERT OR UPDATE ON automark.marks
FOR EACH ROW EXECUTE FUNCTION automark.validate_human_mark();

CREATE FUNCTION automark.protect_question_maximum() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, automark AS $$
BEGIN
    IF NEW.max_mark < OLD.max_mark AND EXISTS (
        SELECT 1 FROM automark.marks m JOIN automark.answers a ON a.id = m.answer_id
        WHERE a.question_id = NEW.id AND m.mark > NEW.max_mark
    ) THEN
        RAISE EXCEPTION 'Question maximum is below an existing human mark'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_question_maximum BEFORE UPDATE ON automark.questions
FOR EACH ROW EXECUTE FUNCTION automark.protect_question_maximum();

CREATE FUNCTION automark.record_mark_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, automark AS $$
BEGIN
    INSERT INTO automark.mark_history
        (mark_id, answer_id, marked_by, mark, notes, status, version)
    VALUES (NEW.id, NEW.answer_id, NEW.marked_by, NEW.mark,
            NEW.notes, NEW.status, NEW.version);
    RETURN NEW;
END;
$$;
CREATE TRIGGER record_mark_history AFTER INSERT OR UPDATE ON automark.marks
FOR EACH ROW EXECUTE FUNCTION automark.record_mark_history();

CREATE FUNCTION automark.claim_answer(p_answer_id bigint, p_tutor_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, automark AS $$
BEGIN
    UPDATE automark.answers SET locked_by = p_tutor_id,
        locked_until = clock_timestamp() + interval '5 minutes'
    WHERE id = p_answer_id AND p_tutor_id IS NOT NULL
        AND (locked_by IS NULL OR locked_until <= clock_timestamp()
             OR locked_by = p_tutor_id);
    RETURN FOUND;
END;
$$;

CREATE FUNCTION automark.release_answer(p_answer_id bigint, p_tutor_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, automark AS $$
BEGIN
    UPDATE automark.answers SET locked_by = NULL, locked_until = NULL
    WHERE id = p_answer_id AND locked_by = p_tutor_id;
    RETURN FOUND;
END;
$$;

CREATE FUNCTION automark.save_mark(
    p_answer_id bigint, p_tutor_id bigint, p_mark numeric, p_notes text,
    p_status automark.marking_status, p_expected_version bigint
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, automark AS $$
DECLARE current_mark automark.marks%ROWTYPE;
DECLARE new_version bigint;
BEGIN
    -- All saves lock the same answer row, including the first mark insertion.
    PERFORM 1 FROM automark.answers WHERE id = p_answer_id
        AND locked_by = p_tutor_id AND locked_until > clock_timestamp()
        FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Claim or renew the answer before saving'
            USING ERRCODE = '55P03';
    END IF;
    SELECT * INTO current_mark FROM automark.marks WHERE answer_id = p_answer_id;
    IF p_expected_version IS NULL
        OR p_expected_version <> coalesce(current_mark.version, 0) THEN
        RAISE EXCEPTION 'Mark changed; reload before saving'
            USING ERRCODE = '40001';
    END IF;
    INSERT INTO automark.marks (answer_id, marked_by, mark, notes, status)
    VALUES (p_answer_id, p_tutor_id, p_mark, p_notes, p_status)
    ON CONFLICT (answer_id) DO UPDATE SET marked_by = EXCLUDED.marked_by,
        mark = EXCLUDED.mark, notes = EXCLUDED.notes, status = EXCLUDED.status
    RETURNING version INTO new_version;
    RETURN new_version;
END;
$$;

CREATE VIEW automark.answer_marking AS
SELECT a.id AS answer_id, s.assignment_id, s.student_id, a.question_id,
       q.question_num, q.title, q.question_type, q.max_mark, a.raw_answer_text,
       m.mark, m.notes, m.marked_by,
       coalesce(m.status, 'unmarked'::automark.marking_status) AS marking_status,
       coalesce(m.version, 0) AS version, a.locked_by, a.locked_until
FROM automark.answers a
JOIN automark.submissions s ON s.id = a.submission_id
JOIN automark.questions q ON q.id = a.question_id
LEFT JOIN automark.marks m ON m.answer_id = a.id;

CREATE VIEW automark.final_marks AS
SELECT s.assignment_id, s.student_id, q.question_num, m.mark, m.notes,
       m.marked_by, m.updated_at
FROM automark.marks m JOIN automark.answers a ON a.id = m.answer_id
JOIN automark.submissions s ON s.id = a.submission_id
JOIN automark.questions q ON q.id = a.question_id
WHERE m.status = 'finalised';

-- Automated processes have no permission to assign human marks.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA automark FROM PUBLIC;
GRANT USAGE ON SCHEMA automark TO automark_app, automark_worker;
REVOKE USAGE ON TYPE automark.question_type, automark.marking_status,
    automark.run_status, automark.review_decision FROM PUBLIC;
GRANT USAGE ON TYPE automark.question_type, automark.marking_status,
    automark.run_status, automark.review_decision TO automark_app, automark_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA automark TO automark_app;
GRANT INSERT, UPDATE ON automark.tutors, automark.assignments,
    automark.questions, automark.submissions, automark.answer_groups,
    automark.answer_group_members TO automark_app;
GRANT INSERT ON automark.answers TO automark_app;
GRANT UPDATE (decision, reviewed_by, reviewed_at)
    ON automark.ai_reviews TO automark_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA automark TO automark_app;
GRANT EXECUTE ON FUNCTION automark.claim_answer(bigint, bigint),
    automark.release_answer(bigint, bigint),
    automark.save_mark(bigint, bigint, numeric, text, automark.marking_status, bigint)
    TO automark_app;

GRANT SELECT ON automark.answers, automark.questions, automark.answer_groups,
    automark.answer_group_members, automark.ai_reviews,
    automark.automated_results TO automark_worker;
GRANT INSERT (answer_id, answer_group_members_id, model_name, corrected_code,
    explanation, suggested_mark) ON automark.ai_reviews TO automark_worker;
GRANT INSERT, UPDATE ON automark.automated_results TO automark_worker;
GRANT USAGE ON SEQUENCE automark.ai_reviews_id_seq,
    automark.automated_results_id_seq TO automark_worker;

COMMIT;
