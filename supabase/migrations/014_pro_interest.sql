-- Capture paid-feature demand before billing is wired.

CREATE TABLE IF NOT EXISTS pro_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone_e164 text,
  plan text NOT NULL DEFAULT 'pro',
  use_case text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pro_interest_contact_required CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL),
  CONSTRAINT pro_interest_email_format CHECK (
    email IS NULL OR (
      length(email) <= 254
      AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    )
  ),
  CONSTRAINT pro_interest_phone_format CHECK (
    phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  ),
  CONSTRAINT pro_interest_plan_check CHECK (plan IN ('pro', 'club'))
);

CREATE INDEX IF NOT EXISTS idx_pro_interest_created_at
  ON pro_interest (created_at DESC);

ALTER TABLE pro_interest ENABLE ROW LEVEL SECURITY;
