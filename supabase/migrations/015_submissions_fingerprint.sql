-- ==========================================================================
-- Migration 015: Add submitter fingerprint to user_submissions
--
-- Enables IP-based rate limiting on the submissions endpoint without
-- storing raw IP addresses.
-- ==========================================================================

ALTER TABLE user_submissions
  ADD COLUMN IF NOT EXISTS submitter_fingerprint text;

CREATE INDEX IF NOT EXISTS idx_user_submissions_fingerprint
  ON user_submissions (submitter_fingerprint)
  WHERE submitter_fingerprint IS NOT NULL;
