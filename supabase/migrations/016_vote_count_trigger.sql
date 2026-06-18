-- ==========================================================================
-- Migration 016: Atomic helpful_count via trigger
--
-- Replaces the application-level recount (which has a race condition between
-- the upsert and the SELECT COUNT + UPDATE) with a Postgres trigger that
-- updates reviews.helpful_count atomically on each insert/update/delete of
-- review_votes.
-- ==========================================================================

CREATE OR REPLACE FUNCTION update_helpful_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_review_id uuid;
BEGIN
  target_review_id := COALESCE(NEW.review_id, OLD.review_id);

  UPDATE reviews
  SET helpful_count = (
    SELECT COUNT(*)
    FROM review_votes
    WHERE review_id = target_review_id
      AND vote_type = 'helpful'
  )
  WHERE id = target_review_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_helpful_count ON review_votes;

CREATE TRIGGER trg_update_helpful_count
AFTER INSERT OR UPDATE OR DELETE ON review_votes
FOR EACH ROW EXECUTE FUNCTION update_helpful_count();
