# Rutgers Course Alert Research

## Findings

- RUSniper publicly claims `0.6 s` average alert latency, sub-second alerts,
  Discord commands, mobile push notifications, and live monitoring of 11k+
  courses.
- Schedru publicly documents email/text notifications and says its check
  interval depends on load, roughly every 15-20 seconds.
- Older open-source Rutgers course snipers generally poll the Rutgers Schedule
  of Classes and send email, SMS, push, or Discord-style notifications. The
  useful patterns are durable de-dupe, short polling intervals, and fast
  provider delivery, not special access to WebReg.
- The current Rutgers SOC JSON endpoint returned `cache-control: max-age=900`
  during testing. `subject` filtering, cache-busting query params, and
  no-cache request headers did not reduce the full-campus payload or change
  the returned ETag in local tests.

## Implementation Direction

- Keep RU Rate as an alerting tool only. Do not auto-register, scrape private
  WebReg sessions, submit registration actions, or store NetID credentials.
- Use Railway for an always-on worker with a 1 second loop.
- Fetch each active campus/term/year source group concurrently.
- Diff in memory by index number and update Supabase once per detected status
  change.
- Notify on open and close through email/SMS with provider-level de-dupe in
  `watched_sections`.
- Measure and log fetch time, loop time, and notification attempts without
  logging email addresses, phone numbers, secrets, or provider payloads.

## Sources

- RUSniper: https://rusniper.com/
- Schedru FAQ/news: https://www.schedru.me/news/
- Schedule Sniper Reddit post: https://www.reddit.com/r/rutgers/comments/1b2lzoy/schedule_sniper_new_fast_rutgers_course_snipers/
- Rutgers Course API repo: https://github.com/anxious-engineer/Rutgers-Course-API
- Lightning course sniper repo: https://github.com/anitejb/lightning
- Sniper email/text repo: https://github.com/v/sniper
