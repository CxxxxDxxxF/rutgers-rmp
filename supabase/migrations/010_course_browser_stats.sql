-- ==========================================================================
-- Migration 010: course_browser_stats RPC
--
-- Per-course aggregates for the course browser: section count, distinct
-- professor count, and the best cached RMP rating among its professors.
-- PostgREST embeds can't express distinct-count + a two-hop join, hence RPC.
-- Scoped by course ids because PostgREST caps responses at max-rows (1000)
-- and the courses table is larger than that.
-- Runs as invoker; anon has SELECT on all referenced tables.
-- ==========================================================================

DROP FUNCTION IF EXISTS course_browser_stats();
CREATE OR REPLACE FUNCTION course_browser_stats(p_course_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  course_id uuid,
  section_count bigint,
  professor_count bigint,
  best_rating numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ta.course_id,
    count(*) AS section_count,
    count(DISTINCT ta.professor_id) AS professor_count,
    max(pc.avg_rating) AS best_rating
  FROM teaching_assignments ta
  LEFT JOIN professors p ON p.id = ta.professor_id
  LEFT JOIN professor_cache pc ON pc.id = p.cache_id
  WHERE ta.status = 'active'
    AND (p_course_ids IS NULL OR ta.course_id = ANY(p_course_ids))
  GROUP BY ta.course_id
$$;

GRANT EXECUTE ON FUNCTION course_browser_stats(uuid[]) TO anon, authenticated;

ALTER FUNCTION course_browser_stats(uuid[]) SET search_path = public;
