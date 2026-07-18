ALTER TABLE public.professor_cache
  ADD COLUMN IF NOT EXISTS tag_counts jsonb;
