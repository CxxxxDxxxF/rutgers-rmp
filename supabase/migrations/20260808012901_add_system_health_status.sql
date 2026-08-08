CREATE TABLE IF NOT EXISTS public.system_health (
  service text PRIMARY KEY,
  healthy boolean NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  detail text
);

ALTER TABLE public.system_health ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.system_health FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.system_health TO service_role;

INSERT INTO public.system_health (service, healthy, checked_at, detail)
VALUES ('rutgers_soc', false, now(), 'awaiting_collector_check')
ON CONFLICT (service) DO NOTHING;

COMMENT ON TABLE public.system_health IS
  'Private service heartbeats written by backend workers and read by server routes.';
