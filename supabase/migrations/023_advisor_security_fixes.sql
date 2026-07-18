-- Advisor fixes: security-definer view, mutable function search_path,
-- per-row auth re-evaluation in RLS, duplicate indexes.
-- Applied to production 2026-07-01 as `advisor_security_fixes`.

-- Create the professor directory view if this repo's migrations are replayed
-- from scratch. Production originally received this in separate remote
-- migrations before the advisor fixes.
CREATE OR REPLACE VIEW public.professor_directory
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.slug,
  p.first_name,
  p.last_name,
  COALESCE(NULLIF(TRIM(pc.department), ''), dep.name) AS department,
  pc.avg_rating,
  pc.avg_difficulty,
  pc.would_take_again,
  COALESCE(pc.num_ratings, 0) AS num_ratings,
  pc.ai_analysis,
  (pc.ai_analysis IS NOT NULL) AS has_ai,
  (pc.id IS NOT NULL) AS is_rated,
  EXISTS (
    SELECT 1
    FROM public.teaching_assignments ta
    WHERE ta.professor_id = p.id
  ) AS teaches
FROM public.professors p
LEFT JOIN public.professor_cache pc ON pc.id = p.cache_id
LEFT JOIN LATERAL (
  SELECT d.name
  FROM public.professor_departments pd
  JOIN public.departments d ON d.id = pd.department_id
  WHERE pd.professor_id = p.id
  ORDER BY pd.is_primary DESC NULLS LAST
  LIMIT 1
) dep ON true;

GRANT SELECT ON public.professor_directory TO anon, authenticated;
GRANT ALL ON public.professor_directory TO service_role;

-- ERROR security_definer_view: enforce querying user's permissions instead.
-- Safe: every underlying table has a public anon_select policy.
ALTER VIEW public.professor_directory SET (security_invoker = true);

-- WARN function_search_path_mutable: pin search_path.
-- Bodies reference unqualified public tables, so pin to public (not '').
ALTER FUNCTION public.set_reviews_updated_at() SET search_path = public;
ALTER FUNCTION public.update_review_flag_count() SET search_path = public;
ALTER FUNCTION public.update_user_subscriptions_updated_at() SET search_path = public;
ALTER FUNCTION public.course_browser_stats(uuid[]) SET search_path = public;

-- WARN auth_rls_initplan: evaluate auth.uid() once per query, not per row.
ALTER POLICY users_select_own ON public.user_subscriptions
  USING ((SELECT auth.uid()) = user_id);

-- WARN duplicate_index: drop one of each identical pair.
DROP INDEX IF EXISTS public.professor_cache_cached_at_idx;
DROP INDEX IF EXISTS public.professor_cache_search_count_idx;
DROP INDEX IF EXISTS public.professor_cache_slug_idx;
DROP INDEX IF EXISTS public.idx_teaching_assignments_professor_id;
