/**
 * SOC Ingestion Pipeline
 *
 * Fetches courses, sections, and instructors from the Rutgers Schedule of
 * Classes API and populates `courses`, `professors`, and
 * `teaching_assignments`.
 *
 * Usage:
 *   npx tsx scripts/ingest-soc.ts
 *   npx tsx scripts/ingest-soc.ts --year 2025 --term 9 --subjects 198
 *   npx tsx scripts/ingest-soc.ts --dry-run --limit 5
 *
 * Options:
 *   --year        Academic year (default: 2025)
 *   --term        Term code: 1=Spring, 7=Summer, 9=Fall (default: 9)
 *   --campus      Campus code (default: NB)
 *   --subjects    Comma-separated subject codes (default: all NB)
 *   --dry-run     Log actions without writing to DB
 *   --limit       Max courses to process
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ── Env / Config ──────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL in env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── CLI args ──────────────────────────────────────────────────────────────

const args: Record<string, string | boolean> = {}
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (arg.startsWith('--')) {
    if (arg.includes('=')) {
      const [k, v] = arg.split('=')
      args[k.slice(2)] = v
    } else {
      const key = arg.slice(2)
      const next = process.argv[i + 1]
      if (next && !next.startsWith('--')) {
        args[key] = next
        i++
      } else {
        args[key] = true
      }
    }
  }
}

const YEAR = parseInt((args['year'] as string) ?? '2025', 10)
const TERM = (args['term'] as string) ?? '9'
const CAMPUS = (args['campus'] as string) ?? 'NB'
const SUBJECTS_FILTER = args['subjects'] ? (args['subjects'] as string).split(',').map(s => s.trim()) : null
const DRY_RUN = args['dry-run'] === true || args['dry-run'] === 'true'
const LIMIT = args['limit'] ? parseInt(args['limit'] as string, 10) : null

// ── Term helpers ──────────────────────────────────────────────────────────

const TERM_MAP: Record<string, string> = {
  '1': 'S',
  '7': 'SU',
  '9': 'F',
}

const TERM_NAME: Record<string, string> = {
  '1': 'Spring',
  '7': 'Summer',
  '9': 'Fall',
}

function buildSemesterCode(year: number, term: string): string {
  return `${TERM_MAP[term] ?? term}${year}`
}

// ── SOC subject → department mapping ──────────────────────────────────────
// Maps SOC numeric subject codes to existing department slugs.
// Unknown subjects => no department link created.

const SUBJECT_TO_DEPT_SLUG: Record<string, string> = {
  '198': 'computer-science',
  '640': 'mathematics',
  '750': 'physics',
  '160': 'chemistry',
  '119': 'biological-sciences',
  '447': 'genetics',
  '830': 'psychology',
  '220': 'economics',
  '790': 'political-science',
  '510': 'history',
  '350': 'english',
  '920': 'sociology',
  '730': 'philosophy',
  '615': 'linguistics',
  '960': 'statistics',
  '082': 'art-history',
  '700': 'music',
  '965': 'theater',
  '192': 'communication',
  '988': 'women-gender-studies',
  '014': 'africana-studies',
  '595': 'latino-studies',
  '567': 'journalism-media-studies',
  '332': 'electrical-engineering',
  '650': 'mechanical-engineering',
  '180': 'civil-engineering',
  '155': 'chemical-engineering',
  '125': 'biomedical-engineering',
  '540': 'industrial-engineering',
  '390': 'finance',
  '010': 'accounting',
  '630': 'marketing',
  '620': 'management',
  '799': 'supply-chain',
  '400': 'food-science',
  '709': 'nutritional-sciences',
  '202': 'criminal-justice',
  '910': 'social-work',
  '300': 'education',
  '833': 'public-policy',
  '832': 'public-health',
}

// ── Stats ─────────────────────────────────────────────────────────────────

const stats = {
  courses_fetched: 0,
  courses_created: 0,
  courses_skipped: 0,
  professors_created: 0,
  professors_found: 0,
  assignments_created: 0,
  assignments_skipped: 0,
  sections_no_instructor: 0,
  errors: [] as string[],
}

let deptCache: Record<string, string> | null = null

async function loadDeptCache(): Promise<Record<string, string>> {
  if (deptCache) return deptCache
  const { data, error } = await supabase.from('departments').select('id, slug')
  if (error) throw new Error(`Failed to load departments: ${error.message}`)
  const map: Record<string, string> = {}
  for (const d of data ?? []) {
    map[d.slug] = d.id
  }
  deptCache = map
  return map
}

// ── Name normalization ────────────────────────────────────────────────────

interface NormalizedName {
  first: string
  last: string
  full: string
}

function normalizeName(raw: string): NormalizedName {
  const trimmed = raw.trim().toUpperCase()
  // Capitalize each word in a string (handles multi-word names like "VAN DYKE")
  const cap = (s: string) =>
    s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')

  // "LIAO, JAMIE" => last="LIAO", first="JAMIE"
  const parts = trimmed.split(',')
  if (parts.length < 2) {
    // No comma: SOC listed name without separator (e.g. "ABELLO MONEDERO").
    // Treat the whole string as last name; first name is unknown.
    const last = cap(trimmed)
    return { first: '', last, full: last }
  }
  const last = parts[0].trim()
  let first = parts.slice(1).join(' ').trim()
  // Strip middle initial: "JOHN A." => "John"
  first = first.replace(/\s+\w\.?\s*$/, '').trim()
  return {
    first: cap(first),
    last: cap(last),
    full: `${cap(last)}, ${cap(first)}`,
  }
}

function generateSlug(name: NormalizedName): string {
  const lastPart = name.last.toLowerCase().replace(/\s+/g, '-')
  const firstPart = name.first.toLowerCase().replace(/\s+/g, '-')
  return firstPart ? `${lastPart}-${firstPart}` : lastPart
}

// ── Course slug from courseString ─────────────────────────────────────────

function courseSlug(courseString: string): string {
  // "01:198:111" => "198-111" (subject + number, unique across subjects)
  const parts = courseString.split(':')
  return parts.slice(-2).join('-').toLowerCase()
}

// ── Meeting-time helpers ──────────────────────────────────────────────────

function formatMeetingDays(mts: any[]): string {
  const days = mts.map((mt: any) => mt.meetingDay).filter(Boolean)
  return [...new Set(days)].join('')
}

function formatMeetingTimes(mts: any[]): string {
  const slots = mts.map((mt: any) => {
    const start = mt.startTimeMilitary
    const end = mt.endTimeMilitary
    const day = mt.meetingDay ?? ''
    return `${day} ${start}-${end}`
  })
  return slots.join('; ')
}

function formatLocation(mt: any): string {
  const building = mt.buildingCode ?? ''
  const room = mt.roomNumber ?? ''
  if (building && room) return `${building} ${room}`
  if (building) return building
  return room
}

function formatCampusName(mts: any[]): string {
  const names = mts.map((mt: any) => mt.campusName).filter(Boolean)
  return [...new Set(names)].join(', ')
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║       SOC Ingestion Pipeline                     ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log()
  console.log(`  Year:       ${YEAR}`)
  console.log(`  Term:       ${TERM} (${TERM_NAME[TERM] ?? 'Unknown'})`)
  console.log(`  Campus:     ${CAMPUS}`)
  console.log(`  Subjects:   ${SUBJECTS_FILTER?.join(', ') ?? 'ALL NB'}`)
  console.log(`  Dry-run:    ${DRY_RUN}`)
  console.log(`  Limit:      ${LIMIT ?? 'none'}`)
  console.log()

  // 1. Fetch SOC data
  console.log('─ Fetching SOC data …')
  // classes.rutgers.edu is the canonical host; sis.rutgers.edu now 302-redirects
  const url = `https://classes.rutgers.edu/soc/api/courses.json?year=${YEAR}&term=${TERM}&campus=${CAMPUS}`
  const resp = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } })
  if (!resp.ok) {
    console.error(`  FAILED: HTTP ${resp.status} – ${resp.statusText}`)
    process.exit(1)
  }
  const allCourses: any[] = await resp.json()
  console.log(`  Fetched ${allCourses.length} courses total (NB ${CAMPUS})`)

  let courses = allCourses
  if (SUBJECTS_FILTER) {
    courses = allCourses.filter((c: any) => SUBJECTS_FILTER!.includes(c.subject))
  }
  if (LIMIT) {
    courses = courses.slice(0, LIMIT)
  }

  console.log(`  Processing ${courses.length} courses`)
  console.log()

  // 2. Ensure semester exists
  const semCode = buildSemesterCode(YEAR, TERM)
  const semName = `${TERM_NAME[TERM] ?? 'Term'} ${YEAR}`
  let semesterId: string | null = null

  if (!DRY_RUN) {
    const { data: existingSem } = await supabase
      .from('semesters')
      .select('id')
      .eq('code', semCode)
      .maybeSingle()

    if (existingSem) {
      semesterId = existingSem.id
      console.log(`  Semester ${semCode} exists: ${semesterId}`)
    } else {
      const { data: newSem, error: semErr } = await supabase
        .from('semesters')
        .insert({
          code: semCode,
          name: semName,
          slug: semCode.toLowerCase(),
          year: YEAR,
          term: TERM_MAP[TERM] ?? TERM,
          is_current: false,
        })
        .select('id')
        .single()
      if (semErr) {
        stats.errors.push(`Semester insert error: ${semErr.message}`)
        console.error(`  FAILED to create semester: ${semErr.message}`)
      } else {
        semesterId = newSem.id
        console.log(`  Created semester ${semCode}: ${semesterId}`)
      }
    }
  }

  const deptMap = await loadDeptCache()
  console.log(`  Loaded ${Object.keys(deptMap).length} departments`)
  console.log()

  // 3. Process each course
  for (let i = 0; i < courses.length; i++) {
    const course = courses[i]
    const courseNum = course.courseString
    const title = course.title
    const subject = course.subject
    const credits = course.credits
    const description = course.courseDescription ?? null
    const academicLevel = course.academicLevelDescription ?? null
    const slug = courseSlug(courseNum)

    console.log(`[${i + 1}/${courses.length}] ${courseNum} – ${title}`)

    // ── Upsert course ───────────────────────────────────────────────
    let courseId: string | null = null

    if (!DRY_RUN) {
      const { data: existingCourse } = await supabase
        .from('courses')
        .select('id')
        .eq('course_number', courseNum)
        .maybeSingle()

      if (existingCourse) {
        courseId = existingCourse.id
        stats.courses_skipped++
      } else {
        const coursePayload: Record<string, any> = {
          course_number: courseNum,
          name: title,
          slug,
          credits: credits ?? null,
          description,
          subject_code: subject,
          academic_level: academicLevel,
        }

        const { data: newCourse, error: courseErr } = await supabase
          .from('courses')
          .insert(coursePayload)
          .select('id')
          .single()

        if (courseErr) {
          stats.errors.push(`Course insert error [${courseNum}]: ${courseErr.message}`)
          console.error(`    ERROR creating course: ${courseErr.message}`)
          continue
        }
        courseId = newCourse.id
        stats.courses_created++
        console.log(`    CREATED course`)

        // Link course to department if we have a mapping
        const deptSlug = SUBJECT_TO_DEPT_SLUG[subject]
        if (deptSlug && deptMap[deptSlug]) {
          const deptId = deptMap[deptSlug]
          const { error: linkErr } = await supabase
            .from('course_departments')
            .insert({ course_id: courseId, department_id: deptId, is_primary: true })
          if (linkErr) {
            stats.errors.push(`Course-dept link error [${courseNum}]: ${linkErr.message}`)
          }
        }
      }
    }

    // ── Process sections ────────────────────────────────────────────
    const sections = course.sections ?? []
    for (const section of sections) {
      const sectionNum = section.number
      const indexNum = section.index
      const instructorsRaw = section.instructors ?? []
      const instructorsText = section.instructorsText ?? ''
      const campusCode = section.campusCode ?? ''
      const openStatus: boolean | null = typeof section.openStatus === 'boolean' ? section.openStatus : null
      const openStatusText: string | null = section.openStatusText ?? null
      const mt = section.meetingTimes ?? []
      const meetingDays = formatMeetingDays(mt)
      const meetingTimes = formatMeetingTimes(mt)
      const campusName = formatCampusName(mt)
      const locations = [...new Set(mt.map((m: any) => formatLocation(m)).filter(Boolean))].join('; ')

      // Build source URL
      const sourceUrl = `https://sis.rutgers.edu/soc/#courses?subject=${subject}&semester=${YEAR}${TERM}&campus=${CAMPUS}`

      stats.courses_fetched++

      if (instructorsRaw.length === 0) {
        stats.sections_no_instructor++
        // Still create a teaching_assignment with null professor_id
        // This represents an unassigned section (TBD)
        console.log(`    Section ${sectionNum} (idx ${indexNum}) – no instructor`)
        if (!DRY_RUN && courseId && semesterId) {
          await upsertAssignment({
            courseId,
            semesterId,
            professorId: null,
            sectionNumber: sectionNum,
            indexNumber: indexNum,
            meetingDays,
            meetingTimes,
            campus: campusName || campusCode,
            location: locations,
            instructorNameRaw: instructorsText || null,
            instructorNameNormalized: null,
            sourceUrl,
            openStatus,
            openStatusText,
          })
        }
        continue
      }

      for (const instructor of instructorsRaw) {
        const rawName: string = instructor.name ?? ''
        if (!rawName.trim()) {
          stats.sections_no_instructor++
          continue
        }

        const normalized = normalizeName(rawName)
        const profSlug = generateSlug(normalized)
        let professorId: string | null = null

        // ── Upsert professor ────────────────────────────────────────
        if (!DRY_RUN) {
          // Try to find existing professor by normalized name or slug
          const { data: existingProf } = await supabase
            .from('professors')
            .select('id, first_name, last_name')
            .or(`slug.eq.${profSlug},and(first_name.eq.${normalized.first},last_name.eq.${normalized.last})`)
            .maybeSingle()

          if (existingProf) {
            professorId = existingProf.id
            stats.professors_found++
          } else {
            const { data: newProf, error: profErr } = await supabase
              .from('professors')
              .insert({
                first_name: normalized.first,
                last_name: normalized.last,
                slug: profSlug,
              })
              .select('id')
              .single()

            if (profErr) {
              if ((profErr as any).code === '23505') {
                // Race condition: parallel worker inserted this professor first.
                // Fall back to SELECT so we don't lose the teaching assignment.
                const { data: raceProf } = await supabase
                  .from('professors')
                  .select('id')
                  .eq('slug', profSlug)
                  .maybeSingle()
                if (raceProf) {
                  professorId = raceProf.id
                  stats.professors_found++
                } else {
                  stats.errors.push(`Professor conflict unresolved [${rawName}]: ${profErr.message}`)
                  continue
                }
              } else {
                stats.errors.push(`Professor insert error [${rawName}]: ${profErr.message}`)
                console.error(`    ERROR creating professor ${rawName}: ${profErr.message}`)
                continue
              }
            } else {
              professorId = newProf.id
              stats.professors_created++

              // Link professor to department
              const deptSlug = SUBJECT_TO_DEPT_SLUG[subject]
              if (deptSlug && deptMap[deptSlug]) {
                const deptId = deptMap[deptSlug]
                const { error: linkErr } = await supabase
                  .from('professor_departments')
                  .insert({ professor_id: professorId, department_id: deptId, is_primary: true })
                if (linkErr) {
                  stats.errors.push(`Prof-dept link error [${rawName}]: ${linkErr.message}`)
                }
              }
            }
          }
        }

        // ── Upsert teaching assignment ──────────────────────────────
        if (!DRY_RUN && courseId && semesterId && professorId) {
          await upsertAssignment({
            courseId,
            semesterId,
            professorId,
            sectionNumber: sectionNum,
            indexNumber: indexNum,
            meetingDays,
            meetingTimes,
            campus: campusName || campusCode,
            location: locations,
            instructorNameRaw: instructorsText || rawName,
            instructorNameNormalized: normalized.full,
            sourceUrl,
            openStatus,
            openStatusText,
          })
        }
      }
    }
  }

  // ── Report ─────────────────────────────────────────────────────────
  console.log()
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║       Ingestion Complete                        ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log()
  console.log(`  Courses fetched:           ${stats.courses_fetched}`)
  console.log(`  Courses created:           ${stats.courses_created}`)
  console.log(`  Courses skipped (exists):  ${stats.courses_skipped}`)
  console.log(`  Professors created:        ${stats.professors_created}`)
  console.log(`  Professors found (exists): ${stats.professors_found}`)
  console.log(`  Assignments created:       ${stats.assignments_created}`)
  console.log(`  Assignments skipped:       ${stats.assignments_skipped}`)
  console.log(`  Sections (no instructor):  ${stats.sections_no_instructor}`)
  console.log(`  Errors:                    ${stats.errors.length}`)

  if (stats.errors.length > 0) {
    console.log()
    console.log('  Errors:')
    for (const err of stats.errors) {
      console.log(`    • ${err}`)
    }
  }

  if (DRY_RUN) {
    console.log()
    console.log('  (dry-run: no data was written)')
  }

  console.log()
}

// ── Upsert teaching assignment ────────────────────────────────────────────

async function upsertAssignment(params: {
  courseId: string
  semesterId: string
  professorId: string | null
  sectionNumber: string
  indexNumber: string
  meetingDays: string
  meetingTimes: string
  campus: string
  location: string
  instructorNameRaw: string | null
  instructorNameNormalized: string | null
  sourceUrl: string
  openStatus: boolean | null
  openStatusText: string | null
}) {
  // Check by (index_number, semester_id) – unique per section+semester
  const { data: existing } = await supabase
    .from('teaching_assignments')
    .select('id')
    .eq('index_number', params.indexNumber)
    .eq('semester_id', params.semesterId)
    .maybeSingle()

  if (existing) {
    // Row already ingested — refresh the section status so re-running the
    // pipeline tracks open/closed transitions without duplicating rows.
    const { error: updErr } = await supabase
      .from('teaching_assignments')
      .update({
        open_status: params.openStatus,
        open_status_text: params.openStatusText,
        status_updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (updErr) {
      stats.errors.push(`TA status update error [idx ${params.indexNumber}]: ${updErr.message}`)
    }
    stats.assignments_skipped++
    return
  }

  const { error: taErr } = await supabase
    .from('teaching_assignments')
    .insert({
      professor_id: params.professorId,
      course_id: params.courseId,
      semester_id: params.semesterId,
      section_number: params.sectionNumber,
      index_number: params.indexNumber,
      meeting_days: params.meetingDays || null,
      meeting_times: params.meetingTimes || null,
      campus: params.campus || null,
      location: params.location || null,
      instructor_name_raw: params.instructorNameRaw,
      instructor_name_normalized: params.instructorNameNormalized,
      source: 'soc',
      source_url: params.sourceUrl,
      confidence: 'verified',
      status: 'active',
      open_status: params.openStatus,
      open_status_text: params.openStatusText,
      status_updated_at: new Date().toISOString(),
    })

  if (taErr) {
    stats.errors.push(`TA insert error [idx ${params.indexNumber}]: ${taErr.message}`)
    console.error(`    ERROR creating assignment for index ${params.indexNumber}: ${taErr.message}`)
  } else {
    stats.assignments_created++
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
