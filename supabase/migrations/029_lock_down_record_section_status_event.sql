-- Advisor fix: record_section_status_event() is SECURITY DEFINER and was
-- executable by anon/authenticated via /rest/v1/rpc. It only needs to run as
-- the trigger on sections, so revoke direct EXECUTE from API roles.
revoke execute on function public.record_section_status_event() from public, anon, authenticated;
