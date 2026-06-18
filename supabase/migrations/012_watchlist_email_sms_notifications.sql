-- ==========================================================================
-- Migration 012: Email/SMS watchlist notifications
--
-- Adds opt-in notification preferences and delivery bookkeeping to the
-- existing anonymous watchlist. RLS remains enabled on watched_sections;
-- public clients still access rows only through /api/watchlist.
-- ==========================================================================

ALTER TABLE watched_sections
  ADD COLUMN IF NOT EXISTS notify_phone_e164 text,
  ADD COLUMN IF NOT EXISTS notify_email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_sms_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_on_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_on_close boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_notified_status text,
  ADD COLUMN IF NOT EXISTS last_notified_assignment_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_notification_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_notification_successes integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'watched_sections_notify_email_format'
  ) THEN
    ALTER TABLE watched_sections
      ADD CONSTRAINT watched_sections_notify_email_format
      CHECK (
        notify_email IS NULL
        OR (
          length(notify_email) <= 254
          AND notify_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
        )
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'watched_sections_notify_phone_e164_format'
  ) THEN
    ALTER TABLE watched_sections
      ADD CONSTRAINT watched_sections_notify_phone_e164_format
      CHECK (
        notify_phone_e164 IS NULL
        OR notify_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
      )
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_watched_sections_notification_ready
  ON watched_sections (teaching_assignment_id)
  WHERE notify_email_enabled OR notify_sms_enabled;
