-- 023_professor_directory_view.sql
--
-- The /professors browse page historically read straight from
-- `professor_cache`, so it could only ever show professors that had been
-- matched to RateMyProfessors (≈1k of ≈4.6k real instructors), and the API
-- further restricted that to rows with an AI write-up (≈90). Students saw a
-- tiny fraction of the faculty who actually teach.
--
-- This view exposes EVERY professor as a directory row, joining RMP signal
-- (rating / difficulty / would-take-again / AI analysis) when it exists and
-- leaving it null otherwise. The API layer filters/sorts/paginates on top.
--
-- Read-only view: no data is modified.

create or replace view professor_directory as
select
  p.id,
  p.slug,
  p.first_name,
  p.last_name,
  coalesce(nullif(trim(pc.department), ''), dep.name) as department,
  pc.avg_rating,
  pc.avg_difficulty,
  pc.would_take_again,
  coalesce(pc.num_ratings, 0)            as num_ratings,
  pc.ai_analysis,
  (pc.ai_analysis is not null)           as has_ai,
  (pc.id is not null)                    as is_rated,
  exists (
    select 1 from teaching_assignments ta where ta.professor_id = p.id
  )                                      as teaches
from professors p
left join professor_cache pc on pc.id = p.cache_id
left join lateral (
  select d.name
  from professor_departments pd
  join departments d on d.id = pd.department_id
  where pd.professor_id = p.id
  order by pd.is_primary desc nulls last
  limit 1
) dep on true;

comment on view professor_directory is
  'Every professor as a browsable directory row; RMP rating + AI analysis joined when available. Backs /api/professors.';

-- Help the lateral teaching lookup and professor_id filters stay cheap.
create index if not exists idx_teaching_assignments_professor_id
  on teaching_assignments (professor_id);

-- Expose the view to the public (anon) and signed-in (authenticated) roles so
-- the browser Supabase client and route handlers can read it. The view only
-- surfaces already-public professor data.
grant select on professor_directory to anon, authenticated;
