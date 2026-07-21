# Course Sniper Research

This file captures the product and technical direction for RU Rate's course
sniper. Operational setup lives in [`sniper-worker.md`](sniper-worker.md).

## External Benchmarks

- RUSniper has publicly marketed sub-second alerts and a `0.6 s` average alert
  latency.
- Schedru has publicly documented email/text notifications with a check
  interval that depends on load, roughly every 15-20 seconds.
- Older open-source Rutgers course snipers generally poll Rutgers Schedule of
  Classes and then send email, SMS, push, or Discord-style notifications.

The useful recurring patterns are:

- poll a stable Rutgers source frequently
- diff by 5-digit index number
- de-dupe status changes durably
- send provider notifications quickly
- never store NetID credentials
- never submit WebReg actions

## Rutgers SOC Findings

The current implementation uses the Rutgers SOC JSON endpoint:

```text
https://classes.rutgers.edu/soc/api/courses.json?year={year}&term={term}&campus={campus}
```

Prior local testing found:

- Rutgers returned a full-campus payload for the tested New Brunswick source.
- `subject` filtering did not reduce the payload from the endpoint in that
  test.
- Cache-busting query parameters and no-cache request headers did not change
  the returned ETag in that test.
- The response included `cache-control: max-age=900` during testing.

That means RU Rate can poll quickly, but it cannot detect a change before
Rutgers exposes the change through SOC.

## Current Implementation

The current design is implemented as a Railway worker:

| Component | Current choice |
| --- | --- |
| Host | Railway Pro |
| Service | `rurate-sniper-worker` |
| Poll loop | `500ms` while active watches exist |
| Idle loop | `1000ms` when no watches exist |
| Watchlist refresh | `5000ms` |
| Error handling | adaptive backoff up to `15000ms` |
| Diff key | 5-digit Rutgers index number |
| State store | Supabase `watched_sections` and `teaching_assignments` |
| Alerts | Email through Resend to the authenticated account address |

The worker only performs read/diff/update/notify work. It does not call WebReg.

## Product Direction

Primary student workflow:

1. Search courses by department, course number, title, credits, and level.
2. Pick a semester.
3. See sections with index numbers, buildings, meeting times, credits,
   professors, and open/closed status.
4. Compare professor rating, difficulty, student grade signals, and native RU
   Rate reviews.
5. Start a snipe from an index number or a course section.
6. Get an email at the authenticated account address when the watched section
   opens.
7. Open WebReg manually and register with the index number.

Secondary workflows:

- compare professors
- rank pasted schedules
- read and leave Rutgers New Brunswick professor reviews
- capture Pro demand before Stripe is wired

## Measurement Plan

Track these without logging private contact details:

| Metric | Why it matters |
| --- | --- |
| Rutgers fetch duration | Practical lower bound for detection speed |
| Loop duration | Whether worker can sustain the configured interval |
| Active watches | Load driver |
| Source groups per loop | Number of SOC payloads fetched |
| Status changes detected | Core sniper result |
| Notification attempts | Delivery volume |
| Provider missing events | Whether email setup is incomplete |
| Provider send errors | Reliability of alert delivery |

## Safety Boundaries

- Do not auto-register.
- Do not scrape private WebReg sessions.
- Do not store NetID credentials.
- Do not submit registration actions.
- Do not log email addresses, phone numbers, secrets, auth headers, cookies, or
  raw provider payloads.
- Keep user-facing pages from aggressively polling Rutgers.

## Sources

- RUSniper: `https://rusniper.com/`
- Schedru FAQ/news: `https://www.schedru.me/news/`
- Schedule Sniper Reddit post:
  `https://www.reddit.com/r/rutgers/comments/1b2lzoy/schedule_sniper_new_fast_rutgers_course_snipers/`
- Rutgers Course API repo: `https://github.com/anxious-engineer/Rutgers-Course-API`
- Lightning course sniper repo: `https://github.com/anitejb/lightning`
- Sniper email/text repo: `https://github.com/v/sniper`
