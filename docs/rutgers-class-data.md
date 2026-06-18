# Rutgers Class Data

RU Rate gets class data from the Rutgers Schedule of Classes (SOC), stores it in
Supabase, and exposes it through read-focused app routes. It does not register
students, submit WebReg actions, or poll Rutgers live from user-facing pages.

## Source Endpoint

Canonical Rutgers SOC JSON endpoint:

```text
https://classes.rutgers.edu/soc/api/courses.json?year={year}&term={term}&campus={campus}
```

Parameters used by `scripts/ingest-soc.ts`:

| Parameter | Values | Notes |
| --- | --- | --- |
| `year` | `2025`, `2026`, etc. | Academic year. |
| `term` | `1`, `7`, `9` | `1` Spring, `7` Summer, `9` Fall. |
| `campus` | `NB`, `NK`, `CM` | New Brunswick, Newark, Camden. Rutgers returns zero rows for `campus=ALL`, so full coverage fans out across these explicit campuses. |
| `subjects` | comma-separated SOC subject codes | Optional local filter after the campus fetch, for example `198,640`. |

The older `https://sis.rutgers.edu/soc/...` host redirects to the current
`classes.rutgers.edu` host. App `source_url` values still point users to the
human SOC page because that is the student-facing source for confirming section
status.

## Coverage Check

Verified source fetch for Fall 2025 on June 18, 2026:

| Campus | Courses | Sections |
| --- | ---: | ---: |
| `NB` | 4,421 | 12,100 |
| `NK` | 1,287 | 2,578 |
| `CM` | 936 | 1,704 |
| Total | 6,644 | 16,382 |

Run a no-write coverage check:

```bash
npm run ingest -- --dry-run --campus all --limit 3
```

Run a focused subject dry-run:

```bash
npm run ingest -- --dry-run --year 2025 --term 9 --campus NB --subjects 198 --limit 25
```

Run a full write only after reviewing a dry-run and confirming Supabase
environment variables are set:

```bash
npm run ingest -- --year 2025 --term 9 --campus all
```

Required for write mode:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

For fast open-section monitoring after data is ingested, use the always-on
worker documented in [`sniper-worker.md`](sniper-worker.md).

## Ingested Fields

`scripts/ingest-soc.ts` stores:

| Source data | Supabase target |
| --- | --- |
| Course number, title, credits, description, subject, academic level | `courses` |
| Semester code, name, year, term | `semesters` |
| Instructor names | `professors`, `professor_departments` |
| Section number, index number, meeting days/times, campus, room, raw instructor text | `teaching_assignments` |
| SOC open/closed status and status text | `teaching_assignments.open_status`, `open_status_text`, `status_updated_at` |
| Course-department mapping for known subject codes | `course_departments` |

Unknown subject codes still ingest courses and sections. They simply skip the
department join until `SUBJECT_TO_DEPT_SLUG` is extended.

## App API Endpoints

Class and course routes:

| Method | Route | Purpose | Data source |
| --- | --- | --- | --- |
| `GET` | `/api/courses` | Course browser list with optional filters: `dept`, `q`, `credits`, `level`. | Supabase `courses`, `course_departments`, `teaching_assignments`, `course_browser_stats` RPC |
| `GET` | `/api/courses/[slug]` | Course detail, sections by semester, professor links, open status, index numbers. | Supabase `courses`, `teaching_assignments`, `semesters`, `professors`, `professor_cache` |
| `GET` | `/api/departments` | Department directory with professor counts and average cached ratings. | Supabase `departments`, `professor_departments`, `professors`, `professor_cache` |
| `GET` | `/api/departments/[slug]` | Department detail with related professors and courses. | Supabase department/course/professor join tables |
| `GET` | `/api/search?q=` | Global search across cached professors, SOC professors, live RMP matches, and courses. | Supabase plus RMP GraphQL for live professor matches |

Watchlist and open-alert routes:

| Method | Route | Purpose | Data source |
| --- | --- | --- | --- |
| `GET` | `/api/watchlist?watcher={uuid}` | Load anonymous browser watchlist with section status and index numbers. | Supabase service role, scoped by `watcher_id` |
| `POST` | `/api/watchlist` | Add a course or section watch. Snapshots current section status into `last_seen_status`. | Supabase service role |
| `PATCH` | `/api/watchlist` | Mark watched section alert state seen by updating `last_seen_status`. | Supabase service role |
| `DELETE` | `/api/watchlist?id={watchId}&watcher={uuid}` | Remove a watch. | Supabase service role |

Professor and review routes that intersect with class data:

| Method | Route | Purpose | Data source |
| --- | --- | --- | --- |
| `POST` | `/api/schedule` | Rank pasted instructor names for a schedule. | RMP GraphQL plus cached AI analysis |
| `GET` | `/api/compare?ids=` | Compare cached professors and courses taught. | Supabase `professor_cache`, `professors`, `teaching_assignments` |
| `GET` | `/api/reviews?professor_id=` | Load native RU Rate reviews for a professor. | Supabase `reviews`, optional `courses` |
| `POST` | `/api/reviews` | Submit a native review tied to an RMP professor and optional course. | Supabase service role |
| `POST` | `/api/reviews/[id]/vote` | Mark a native review helpful or not helpful, fingerprinted by salted IP/user-agent hash. | Supabase service role |
| `POST` | `/api/submissions` | Submit a missing professor/section report for a course. | Supabase service role |
| `GET` | `/api/submissions?course_id=` | Load pending user submissions for a course. | Supabase service role |
| `GET` | `/api/admin/submissions?status=` | Admin moderation list. Requires `Authorization: Bearer {ADMIN_SECRET}`. | Supabase service role |
| `PATCH` | `/api/submissions/[id]` | Approve or reject a submission. Requires admin bearer token. | Supabase service role |

RMP analysis route:

| Method | Route | Purpose | Data source |
| --- | --- | --- | --- |
| `POST` | `/api/analyze` | Fetch and cache RMP professor profile plus AI analysis. | RMP GraphQL, OpenRouter, Supabase cache |

## Safety Boundaries

- Rutgers SOC is fetched by batch ingest, not by user-facing live polling.
- Open-section alerts compare browser watchlist state against the latest status
  already stored in Supabase.
- RU Rate never calls WebReg, never auto-registers, and never submits student
  registration actions.
- Write routes that touch private watchlist/review/submission state use the
  Supabase service role on the server and should not expose service keys to the
  browser.
