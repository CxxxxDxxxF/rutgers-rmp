-- ==========================================================================
-- Migration 011: Harden RLS — anon is read-only everywhere
--
-- The live database predated migration 007 and carried legacy open_access_*
-- policies (cmd = ALL, qual = true) that let the public anon key INSERT/
-- UPDATE/DELETE core tables. All app writes go through the service role,
-- so anon needs SELECT only. Also adds the previously MISSING anon SELECT
-- policy on teaching_assignments (RLS was enabled with no policy, so the
-- app saw zero sections).
-- Applied to production 2026-06-12. Safe to re-run.
-- ==========================================================================

DROP POLICY IF EXISTS "open_access_course_departments" ON course_departments;
DROP POLICY IF EXISTS "open_access_course_majors"      ON course_majors;
DROP POLICY IF EXISTS "open_access_course_minors"      ON course_minors;
DROP POLICY IF EXISTS "open_access_courses"            ON courses;
DROP POLICY IF EXISTS "open_access_departments"        ON departments;
DROP POLICY IF EXISTS "open_access_majors"             ON majors;
DROP POLICY IF EXISTS "open_access_minors"             ON minors;
DROP POLICY IF EXISTS "open_access_professor_departments" ON professor_departments;
DROP POLICY IF EXISTS "open_access_professors"         ON professors;
DROP POLICY IF EXISTS "open_access_reviews"            ON reviews;
DROP POLICY IF EXISTS "open_access_semesters"          ON semesters;
DROP POLICY IF EXISTS "open_access_user_submissions"   ON user_submissions;
DROP POLICY IF EXISTS "open_access_verification_records" ON verification_records;
DROP POLICY IF EXISTS "professor_cache_insert_public"  ON professor_cache;
DROP POLICY IF EXISTS "professor_cache_update_public"  ON professor_cache;
DROP POLICY IF EXISTS "professor_cache_select_public"  ON professor_cache;

DROP POLICY IF EXISTS "anon_select" ON professor_cache;
DROP POLICY IF EXISTS "anon_select" ON professors;
DROP POLICY IF EXISTS "anon_select" ON professor_departments;
DROP POLICY IF EXISTS "anon_select" ON departments;
DROP POLICY IF EXISTS "anon_select" ON courses;
DROP POLICY IF EXISTS "anon_select" ON course_departments;
DROP POLICY IF EXISTS "anon_select" ON semesters;
DROP POLICY IF EXISTS "anon_select" ON teaching_assignments;
DROP POLICY IF EXISTS "anon_select" ON reviews;
DROP POLICY IF EXISTS "anon_select" ON majors;
DROP POLICY IF EXISTS "anon_select" ON minors;
DROP POLICY IF EXISTS "anon_select" ON course_majors;
DROP POLICY IF EXISTS "anon_select" ON course_minors;

CREATE POLICY "anon_select" ON professor_cache       FOR SELECT USING (true);
CREATE POLICY "anon_select" ON professors            FOR SELECT USING (true);
CREATE POLICY "anon_select" ON professor_departments FOR SELECT USING (true);
CREATE POLICY "anon_select" ON departments           FOR SELECT USING (true);
CREATE POLICY "anon_select" ON courses               FOR SELECT USING (true);
CREATE POLICY "anon_select" ON course_departments    FOR SELECT USING (true);
CREATE POLICY "anon_select" ON semesters             FOR SELECT USING (true);
CREATE POLICY "anon_select" ON teaching_assignments  FOR SELECT USING (true);
CREATE POLICY "anon_select" ON reviews               FOR SELECT USING (true);
CREATE POLICY "anon_select" ON majors                FOR SELECT USING (true);
CREATE POLICY "anon_select" ON minors                FOR SELECT USING (true);
CREATE POLICY "anon_select" ON course_majors         FOR SELECT USING (true);
CREATE POLICY "anon_select" ON course_minors         FOR SELECT USING (true);

-- user_submissions, search_history, verification_records, review_votes,
-- watched_sections: no anon policies — service role only.
