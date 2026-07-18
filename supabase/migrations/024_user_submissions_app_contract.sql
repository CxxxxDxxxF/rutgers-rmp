-- Align user_submissions with the public submission/admin routes.
-- The app stores the submitted professor text even when it cannot resolve an
-- existing professor row, stores the client semester code, and rate-limits by a
-- salted fingerprint instead of raw IP.

ALTER TABLE public.user_submissions
  ADD COLUMN IF NOT EXISTS professor_name text,
  ADD COLUMN IF NOT EXISTS semester_code text,
  ADD COLUMN IF NOT EXISTS submitter_fingerprint text;

CREATE INDEX IF NOT EXISTS idx_user_submissions_fingerprint
  ON public.user_submissions (submitter_fingerprint)
  WHERE submitter_fingerprint IS NOT NULL;
