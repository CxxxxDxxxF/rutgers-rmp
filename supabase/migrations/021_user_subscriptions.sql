CREATE TABLE user_subscriptions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID        NOT NULL,
  email                  TEXT,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT        UNIQUE,
  stripe_price_id        TEXT,
  status                 TEXT        NOT NULL DEFAULT 'inactive',
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_subscriptions_user_id_idx ON user_subscriptions (user_id);

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON user_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_user_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_subscriptions_updated_at();
