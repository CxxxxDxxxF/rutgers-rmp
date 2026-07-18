-- ==========================================================================
-- Verification for migration 024 (section_status_events trigger).
--
-- Proves the trigger records exactly one event per real open_status change,
-- a baseline event on first-seen status, and nothing on a same-status write.
-- The whole script runs inside BEGIN/ROLLBACK, so it writes no permanent data
-- and is safe to run against any database that has migration 024 applied
-- (including production — it rolls back).
--
-- Run:
--   psql "$DATABASE_URL" -f scripts/verify-status-events.sql
-- Expect a "ALL TESTS PASSED" NOTICE and a clean ROLLBACK. Any failure raises
-- an exception and aborts.
-- ==========================================================================

BEGIN;

DO $$
DECLARE
  v_course uuid;
  v_sem    uuid;
  a1       uuid;
  a2       uuid;
  n        int;
BEGIN
  SELECT id INTO v_course FROM courses LIMIT 1;
  SELECT id INTO v_sem    FROM semesters LIMIT 1;
  IF v_course IS NULL THEN
    RAISE EXCEPTION 'verify-status-events: need at least one row in courses to test against';
  END IF;

  -- Test A — INSERT with a known status writes one baseline event (prev NULL).
  INSERT INTO teaching_assignments (course_id, semester_id, index_number, open_status, open_status_text, status_updated_at)
  VALUES (v_course, v_sem, 'TEST-A', false, 'CLOSED', now())
  RETURNING id INTO a1;

  SELECT count(*) INTO n FROM section_status_events WHERE assignment_id = a1;
  IF n <> 1 THEN RAISE EXCEPTION 'A: expected 1 baseline event, got %', n; END IF;
  PERFORM 1 FROM section_status_events
    WHERE assignment_id = a1 AND prev_status IS NULL AND new_status = false AND new_status_text = 'CLOSED';
  IF NOT FOUND THEN RAISE EXCEPTION 'A: baseline event content wrong'; END IF;

  -- Test B — a real transition (false -> true) writes one event with both texts.
  UPDATE teaching_assignments
    SET open_status = true, open_status_text = 'OPEN', status_updated_at = now()
    WHERE id = a1;

  SELECT count(*) INTO n FROM section_status_events WHERE assignment_id = a1;
  IF n <> 2 THEN RAISE EXCEPTION 'B: expected 2 events total after transition, got %', n; END IF;
  PERFORM 1 FROM section_status_events
    WHERE assignment_id = a1 AND prev_status = false AND new_status = true
      AND prev_status_text = 'CLOSED' AND new_status_text = 'OPEN';
  IF NOT FOUND THEN RAISE EXCEPTION 'B: transition event content wrong'; END IF;

  -- Test C — a same-status write (true -> true) records nothing (idempotent).
  UPDATE teaching_assignments
    SET open_status = true, open_status_text = 'OPEN', status_updated_at = now()
    WHERE id = a1;

  SELECT count(*) INTO n FROM section_status_events WHERE assignment_id = a1;
  IF n <> 2 THEN RAISE EXCEPTION 'C: same-status write must not add an event, got %', n; END IF;

  -- Test E — INSERT with NULL status writes no baseline; the first real value
  -- (NULL -> true) then writes one event.
  INSERT INTO teaching_assignments (course_id, semester_id, index_number, open_status, status_updated_at)
  VALUES (v_course, v_sem, 'TEST-E', NULL, now())
  RETURNING id INTO a2;

  SELECT count(*) INTO n FROM section_status_events WHERE assignment_id = a2;
  IF n <> 0 THEN RAISE EXCEPTION 'E: NULL insert must not create a baseline, got %', n; END IF;

  UPDATE teaching_assignments
    SET open_status = true, open_status_text = 'OPEN', status_updated_at = now()
    WHERE id = a2;

  SELECT count(*) INTO n FROM section_status_events WHERE assignment_id = a2;
  IF n <> 1 THEN RAISE EXCEPTION 'E: NULL -> true must create 1 event, got %', n; END IF;
  PERFORM 1 FROM section_status_events
    WHERE assignment_id = a2 AND prev_status IS NULL AND new_status = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'E: NULL -> true event content wrong'; END IF;

  RAISE NOTICE 'section_status_events trigger: ALL TESTS PASSED';
END $$;

ROLLBACK;
