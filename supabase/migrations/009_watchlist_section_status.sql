-- ==========================================================================
-- Migration 009: Section open-status tracking + course watchlist
--
-- 1. teaching_assignments gains open_status fields. These are populated by
--    the SOC ingestion script (scripts/ingest-soc.ts) from the official
--    Rutgers SOC API. They reflect the status AT LAST INGEST — this app
--    does not poll Rutgers live and never auto-registers anyone.
-- 2. watched_sections: anonymous watchlist keyed by a client-generated
--    watcher_id (localStorage UUID). No auth system exists yet, so there
--    is no user table to reference. notify_email is a placeholder for a
--    future notification feature and is NOT used to send anything today.
--
-- Safe to re-run: uses IF NOT EXISTS throughout.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. Section status columns
-- --------------------------------------------------------------------------
ALTER TABLE teaching_assignments ADD COLUMN IF NOT EXISTS open_status boolean;
ALTER TABLE teaching_assignments ADD COLUMN IF NOT EXISTS open_status_text text;
ALTER TABLE teaching_assignments ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_ta_open_status
  ON teaching_assignments (open_status);

-- --------------------------------------------------------------------------
-- 2. Watchlist table
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watched_sections (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  watcher_id             text        NOT NULL,
  course_id              uuid        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teaching_assignment_id uuid        REFERENCES teaching_assignments(id) ON DELETE CASCADE,
  index_number           text,
  last_seen_status       text,
  notify_email           text,
  created_at             timestamptz DEFAULT now(),
  UNIQUE (watcher_id, course_id, teaching_assignment_id)
);

CREATE INDEX IF NOT EXISTS idx_watched_sections_watcher
  ON watched_sections (watcher_id);

CREATE INDEX IF NOT EXISTS idx_watched_sections_assignment
  ON watched_sections (teaching_assignment_id);

-- RLS: no anon access — all reads/writes go through /api/watchlist using
-- the service role client, scoped by watcher_id.
ALTER TABLE watched_sections ENABLE ROW LEVEL SECURITY;
