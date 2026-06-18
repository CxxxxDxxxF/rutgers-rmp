-- Add the covering index recommended by Supabase advisors for the
-- watched_sections.course_id foreign key.

CREATE INDEX IF NOT EXISTS idx_watched_sections_course
  ON watched_sections (course_id);
