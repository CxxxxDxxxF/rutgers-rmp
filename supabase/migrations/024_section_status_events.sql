-- ==========================================================================
-- Migration 024: Append-only section open/closed status history
--
-- Records every real transition of teaching_assignments.open_status into an
-- append-only log so open-probability and historical-pattern analytics
-- ("this section usually releases seats 4-8 days before classes") can be
-- built later. This history CANNOT be reconstructed after the fact — the
-- teaching_assignments row only stores the current status and its last
-- update time, so prior transitions are overwritten and lost. This migration
-- starts the clock.
--
-- Capture happens at the column via a trigger, not in application code, so it
-- is source-agnostic: it covers all three writers of open_status
-- (scripts/ingest-soc.ts, the worker's per-watch poll, and the worker's bulk
-- refresh) without touching any of them. It is idempotent by construction —
-- the WHEN clause only fires on an actual value change, and Postgres row locks
-- serialize concurrent writers, so each real flip yields exactly one event.
--
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. Event log table
-- --------------------------------------------------------------------------
-- assignment_id is the stable key: a Rutgers index_number is reassigned each
-- term, so it is only unique within a semester. index_number/semester_id are
-- denormalized snapshots for cheap per-term queries and debugging.
CREATE TABLE IF NOT EXISTS section_status_events (
  id               bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assignment_id    uuid        NOT NULL REFERENCES teaching_assignments(id) ON DELETE CASCADE,
  semester_id      uuid        REFERENCES semesters(id) ON DELETE SET NULL,
  index_number     text,
  prev_status      boolean,          -- NULL on the baseline (first-seen) event
  new_status       boolean,
  prev_status_text text,
  new_status_text  text,
  source           text,             -- optional: 'ingest' | 'poll' | 'bulk' (see note below)
  observed_at      timestamptz NOT NULL DEFAULT now()
);

-- Per-section timeline (the common analytics access pattern).
CREATE INDEX IF NOT EXISTS idx_sse_assignment_observed
  ON section_status_events (assignment_id, observed_at DESC);

-- Per-term sweeps.
CREATE INDEX IF NOT EXISTS idx_sse_semester_observed
  ON section_status_events (semester_id, observed_at DESC);

-- No anon access. Writes come from the trigger (SECURITY DEFINER); reads go
-- through server routes using the service-role client, matching how
-- watched_sections is locked down in migration 009.
ALTER TABLE section_status_events ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- 2. Trigger function
-- --------------------------------------------------------------------------
-- SECURITY DEFINER so the insert succeeds regardless of which role mutated
-- teaching_assignments. `source` is read from an optional session setting
-- (app.event_source); writers that cannot set it simply leave it NULL — no
-- worker change is required for capture to work.
CREATE OR REPLACE FUNCTION record_section_status_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO section_status_events (
    assignment_id, semester_id, index_number,
    prev_status, new_status, prev_status_text, new_status_text,
    source, observed_at
  ) VALUES (
    NEW.id, NEW.semester_id, NEW.index_number,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.open_status ELSE NULL END,
    NEW.open_status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.open_status_text ELSE NULL END,
    NEW.open_status_text,
    NULLIF(current_setting('app.event_source', true), ''),
    COALESCE(NEW.status_updated_at, now())
  );
  RETURN NULL; -- AFTER trigger: return value is ignored
END;
$$;

-- --------------------------------------------------------------------------
-- 3. Triggers
-- --------------------------------------------------------------------------
-- Split INSERT and UPDATE so the WHEN clause can reference OLD only where it
-- exists. INSERT with a known status is the baseline (prev_status NULL);
-- UPDATE fires only on an actual open_status change.
DROP TRIGGER IF EXISTS trg_record_section_status_event_insert ON teaching_assignments;
CREATE TRIGGER trg_record_section_status_event_insert
AFTER INSERT ON teaching_assignments
FOR EACH ROW
WHEN (NEW.open_status IS NOT NULL)
EXECUTE FUNCTION record_section_status_event();

DROP TRIGGER IF EXISTS trg_record_section_status_event_update ON teaching_assignments;
CREATE TRIGGER trg_record_section_status_event_update
AFTER UPDATE OF open_status ON teaching_assignments
FOR EACH ROW
WHEN (OLD.open_status IS DISTINCT FROM NEW.open_status)
EXECUTE FUNCTION record_section_status_event();
