-- ==========================================================================
-- Migration 007: Row Level Security
--
-- Enables RLS on all tables and adds conservative access policies.
-- API routes that write use the service role key (bypasses RLS).
-- The anon key may only SELECT from public-facing read-only tables.
--
-- Safe to re-run: policies are dropped before creation.
-- review_votes is handled in a DO block in case the table does not yet exist.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- Enable RLS on tables that are confirmed to exist from migrations 001-006
-- --------------------------------------------------------------------------
ALTER TABLE professor_cache       ENABLE ROW LEVEL SECURITY;
ALTER TABLE professors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_departments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE semesters             ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_submissions      ENABLE ROW LEVEL SECURITY;

-- review_votes: guarded with IF EXISTS so migration does not fail
-- if the table was created in a missing migration (004/005)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'review_votes'
  ) THEN
    EXECUTE 'ALTER TABLE review_votes ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- Drop policies before recreating (idempotent)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_select"         ON professor_cache;
DROP POLICY IF EXISTS "anon_select"         ON professors;
DROP POLICY IF EXISTS "anon_select"         ON professor_departments;
DROP POLICY IF EXISTS "anon_select"         ON departments;
DROP POLICY IF EXISTS "anon_select"         ON courses;
DROP POLICY IF EXISTS "anon_select"         ON course_departments;
DROP POLICY IF EXISTS "anon_select"         ON semesters;
DROP POLICY IF EXISTS "anon_select"         ON teaching_assignments;
DROP POLICY IF EXISTS "anon_select"         ON reviews;
DROP POLICY IF EXISTS "anon_select_pending" ON user_submissions;

-- --------------------------------------------------------------------------
-- Public read-only tables
-- Anon may SELECT; all writes go through server routes using the service role.
-- --------------------------------------------------------------------------
CREATE POLICY "anon_select" ON professor_cache       FOR SELECT USING (true);
CREATE POLICY "anon_select" ON professors            FOR SELECT USING (true);
CREATE POLICY "anon_select" ON professor_departments FOR SELECT USING (true);
CREATE POLICY "anon_select" ON departments           FOR SELECT USING (true);
CREATE POLICY "anon_select" ON courses               FOR SELECT USING (true);
CREATE POLICY "anon_select" ON course_departments    FOR SELECT USING (true);
CREATE POLICY "anon_select" ON semesters             FOR SELECT USING (true);
CREATE POLICY "anon_select" ON teaching_assignments  FOR SELECT USING (true);

-- --------------------------------------------------------------------------
-- reviews: public read (displayed on professor pages via /api/reviews GET)
-- No anon INSERT/UPDATE/DELETE — POST /api/reviews uses the service role.
-- --------------------------------------------------------------------------
CREATE POLICY "anon_select" ON reviews FOR SELECT USING (true);

-- --------------------------------------------------------------------------
-- user_submissions: no anon access at all.
-- GET /api/submissions (course page) uses the service role client.
-- Admin reads and status updates use the service role + ADMIN_SECRET check.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- review_votes: no anon access at all (server-side only via service role).
-- --------------------------------------------------------------------------
