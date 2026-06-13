-- ==========================================================================
-- Migration 008: review_votes table
--
-- Creates a durable server-side vote store for native reviews.
-- voter_fingerprint is a SHA-256 hash of (salt + IP + user-agent),
-- so raw IPs are never stored.
-- One vote per (review, fingerprint). Vote type can be changed (upsert).
-- ==========================================================================

CREATE TABLE IF NOT EXISTS review_votes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id        uuid        NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  voter_fingerprint text       NOT NULL,
  vote_type        text        NOT NULL CHECK (vote_type IN ('helpful', 'not_helpful')),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (review_id, voter_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_review_votes_review_id
  ON review_votes (review_id);

CREATE INDEX IF NOT EXISTS idx_review_votes_type
  ON review_votes (review_id, vote_type);

-- RLS: no anon access — service role handles all reads and writes
ALTER TABLE review_votes ENABLE ROW LEVEL SECURITY;
