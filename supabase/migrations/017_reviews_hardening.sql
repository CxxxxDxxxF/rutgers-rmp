-- ==========================================================================
-- Migration 017: Reviews hardening
--
-- Adds:
--   - updated_at with auto-update trigger
--   - is_removed / removed_at for soft-delete
--   - flag_count maintained by a trigger on review_flags
--   - review_flags table (one row per fingerprint per review)
-- ==========================================================================

-- updated_at -----------------------------------------------------------------
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at timestamptz;
UPDATE reviews SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE reviews ALTER COLUMN updated_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION set_reviews_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON reviews;
CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_reviews_updated_at();

-- soft-delete ----------------------------------------------------------------
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_removed boolean NOT NULL DEFAULT false;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS removed_at timestamptz;

-- community flagging ---------------------------------------------------------
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS flag_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS review_flags (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id           uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  flagger_fingerprint text NOT NULL,
  reason              text,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (review_id, flagger_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_review_flags_review_id ON review_flags (review_id);

-- Trigger: maintain flag_count and auto-remove at 5 flags --------------------
CREATE OR REPLACE FUNCTION update_review_flag_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_id  uuid;
  new_count  integer;
  FLAG_THRESHOLD CONSTANT integer := 5;
BEGIN
  target_id := COALESCE(NEW.review_id, OLD.review_id);

  SELECT COUNT(*) INTO new_count FROM review_flags WHERE review_id = target_id;

  IF new_count >= FLAG_THRESHOLD THEN
    UPDATE reviews
    SET flag_count = new_count,
        is_removed = true,
        removed_at = COALESCE(removed_at, now())
    WHERE id = target_id AND NOT is_removed;
  ELSE
    UPDATE reviews SET flag_count = new_count WHERE id = target_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_review_flag_count ON review_flags;
CREATE TRIGGER trg_update_review_flag_count
  AFTER INSERT OR DELETE ON review_flags
  FOR EACH ROW EXECUTE FUNCTION update_review_flag_count();

-- Partial index for the common "active reviews for professor" query ----------
CREATE INDEX IF NOT EXISTS idx_reviews_prof_active
  ON reviews (professor_id, created_at DESC)
  WHERE is_removed = false;
