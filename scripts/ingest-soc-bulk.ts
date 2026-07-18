#!/usr/bin/env -S npx tsx
/**
 * Bulk Rutgers SOC ingest for large backfills.
 *
 * This keeps the same data contract as scripts/ingest-soc.ts but avoids the
 * per-row query loop that makes all-campus backfills too slow.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { RUTGERS_SUBJECT_TO_DEPT_SLUG } from '../lib/rutgers-subject-map'

const args: Record<string, string | boolean> = {}
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (!arg.startsWith('--')) continue
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

function loadEnvFile(fileName: string) {
  const filePath = path.resolve(process.cwd(), fileName)
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const sep = trimmed.indexOf('=')
    if (sep === -1) continue
    const k = trimmed.slice(0, sep)
    const v = trimmed.slice(sep + 1).replace(/^['"]|['"]$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const YEAR = parseInt((args.year as string) ?? '2026', 10)
const TERM = (args.term as string) ?? '9'
const CAMPUS_ARG = ((args.campus as string) ?? 'NB').trim()
const SUBJECTS_FILTER = args.subjects
  ? new Set((args.subjects as string).split(',').map(s => s.trim()).filter(Boolean))
  : null
const DRY_RUN = args['dry-run'] === true || args['dry-run'] === 'true'
const CHUNK_SIZE = args['chunk-size'] ? parseInt(args['chunk-size'] as string, 10) : 500

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL in env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

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

const ALL_CAMPUSES = ['NB', 'NK', 'CM'] as const

interface NormalizedName {
  first: string
  last: string
  full: string
}

interface CampusCourse {
  campus: string
  course: any
}

function parseCampuses(value: string): string[] {
  if (value.toLowerCase() === 'all') return [...ALL_CAMPUSES]
  return [...new Set(value.split(',').map(c => c.trim().toUpperCase()).filter(Boolean))]
}

function buildSemesterCode(year: number, term: string): string {
  return `${TERM_MAP[term] ?? term}${year}`
}

function normalizeName(raw: string): NormalizedName {
  const trimmed = raw.trim().toUpperCase()
  const cap = (s: string) =>
    s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')

  const parts = trimmed.split(',')
  if (parts.length < 2) {
    const last = cap(trimmed)
    return { first: '', last, full: last }
  }

  const last = parts[0].trim()
  let first = parts.slice(1).join(' ').trim()
  first = first.replace(/\s+\w\.?\s*$/, '').trim()
  return {
    first: cap(first),
    last: cap(last),
    full: `${cap(last)}, ${cap(first)}`,
  }
}

function professorSlug(name: NormalizedName): string {
  const lastPart = name.last.toLowerCase().replace(/\s+/g, '-')
  const firstPart = name.first.toLowerCase().replace(/\s+/g, '-')
  return firstPart ? `${lastPart}-${firstPart}` : lastPart
}

function courseSlug(courseString: string): string {
  const parts = courseString.split(':')
  const slugParts = parts[0] === '01' ? parts.slice(-2) : parts
  return slugParts.join('-').toLowerCase()
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatMeetingDays(mts: any[]): string {
  const days = mts.map((mt: any) => mt.meetingDay).filter(Boolean)
  return [...new Set(days)].join('')
}

function formatMeetingTimes(mts: any[]): string {
  return mts.map((mt: any) => {
    const day = mt.meetingDay ?? ''
    return `${day} ${mt.startTimeMilitary}-${mt.endTimeMilitary}`
  }).join('; ')
}

function formatLocation(mt: any): string {
  const building = mt.buildingCode ?? ''
  const room = mt.roomNumber ?? ''
  if (building && room) return `${building} ${room}`
  return building || room
}

function formatCampusName(mts: any[]): string {
  const names = mts.map((mt: any) => mt.campusName).filter(Boolean)
  return [...new Set(names)].join(', ')
}

async function fetchCourses(campuses: string[]): Promise<CampusCourse[]> {
  const rows: CampusCourse[] = []

  for (const campus of campuses) {
    const url = `https://classes.rutgers.edu/soc/api/courses.json?year=${YEAR}&term=${TERM}&campus=${campus}`
    const resp = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } })
    if (!resp.ok) throw new Error(`Rutgers SOC ${campus} failed: ${resp.status} ${resp.statusText}`)
    const campusCourses: any[] = await resp.json()
    const sections = campusCourses.reduce((sum, course) => sum + ((course.sections as any[] | undefined)?.length ?? 0), 0)
    console.log(`  ${campus}: ${campusCourses.length} courses, ${sections} sections`)
    rows.push(...campusCourses.map(course => ({ campus, course })))
  }

  return rows
}

function chunks<T>(rows: T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

async function fetchByIn<T>(table: string, select: string, column: string, values: string[]): Promise<T[]> {
  const rows: T[] = []
  for (const chunk of chunks([...new Set(values)])) {
    if (chunk.length === 0) continue
    const { data, error } = await supabase.from(table).select(select).in(column, chunk)
    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`)
    rows.push(...((data ?? []) as T[]))
  }
  return rows
}

async function upsertChunks(table: string, rows: Record<string, unknown>[], onConflict: string) {
  let written = 0
  for (const chunk of chunks(rows)) {
    if (chunk.length === 0) continue
    const { error } = await supabase.from(table).upsert(chunk, { onConflict })
    if (error) throw new Error(`Failed to upsert ${table}: ${error.message}`)
    written += chunk.length
  }
  return written
}

function uniqueRows(rows: Record<string, unknown>[], fields: string[]) {
  const byKey = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const key = fields.map(field => String(row[field] ?? '')).join('\u0000')
    const existing = byKey.get(key)
    if (existing && existing.professor_id && !row.professor_id) continue
    byKey.set(key, row)
  }
  return [...byKey.values()]
}

function departmentNameForSubject(subject: string, sourceCourses: CampusCourse[]) {
  const match = sourceCourses.find(row => row.course.subject === subject)
  const name = String(match?.course.subjectDescription ?? '').trim()
  return name || `Rutgers Subject ${subject}`
}

function sectionInstructorName(section: any): string | null {
  const structured = ((section.instructors ?? []) as any[])
    .map(instructor => instructor.name as string | undefined)
    .find(name => !!name?.trim())
  if (structured?.trim()) return structured.trim()

  const text = String(section.instructorsText ?? '').trim()
  return text || null
}

async function main() {
  const campuses = parseCampuses(CAMPUS_ARG)
  console.log(`Bulk SOC ingest: year=${YEAR} term=${TERM} campus=${campuses.join(',')} dryRun=${DRY_RUN}`)

  const fetched = await fetchCourses(campuses)
  const sourceCourses = SUBJECTS_FILTER
    ? fetched.filter(row => SUBJECTS_FILTER.has(row.course.subject))
    : fetched
  const sourceSections = sourceCourses.reduce((sum, row) => sum + ((row.course.sections as any[] | undefined)?.length ?? 0), 0)
  console.log(`  Processing ${sourceCourses.length} courses and ${sourceSections} sections`)

  const semCode = buildSemesterCode(YEAR, TERM)
  const semName = `${TERM_NAME[TERM] ?? 'Term'} ${YEAR}`

  const deptResult = await supabase.from('departments').select('id, code, slug')
  let departments = deptResult.data
  if (deptResult.error) throw new Error(`Failed to load departments: ${deptResult.error.message}`)
  let deptBySlug = new Map((departments ?? []).map((d: any) => [d.slug as string, d.id as string]))
  let deptByCode = new Map((departments ?? []).map((d: any) => [d.code as string, d.id as string]))

  const sourceSubjects = [...new Set(sourceCourses.map(row => row.course.subject as string).filter(Boolean))]
  const missingDepartmentRows = sourceSubjects
    .filter(subject => {
      const mappedSlug = RUTGERS_SUBJECT_TO_DEPT_SLUG[subject]
      return !(mappedSlug && deptBySlug.has(mappedSlug)) && !deptByCode.has(subject)
    })
    .map(subject => {
      const name = departmentNameForSubject(subject, sourceCourses)
      return {
        code: subject,
        name,
        full_name: name,
        school: 'Rutgers',
        slug: `rutgers-${subject}-${slugify(name)}`,
      }
    })

  if (missingDepartmentRows.length > 0 && !DRY_RUN) {
    console.log(`  Creating ${missingDepartmentRows.length} generated subject departments...`)
    await upsertChunks('departments', missingDepartmentRows, 'code')
    const refreshed = await supabase.from('departments').select('id, code, slug')
    if (refreshed.error) throw new Error(`Failed to reload departments: ${refreshed.error.message}`)
    departments = refreshed.data
    deptBySlug = new Map((departments ?? []).map((d: any) => [d.slug as string, d.id as string]))
    deptByCode = new Map((departments ?? []).map((d: any) => [d.code as string, d.id as string]))
  }

  const deptIdForSubject = (subject: string): string | null => {
    const mappedSlug = RUTGERS_SUBJECT_TO_DEPT_SLUG[subject]
    return (mappedSlug ? deptBySlug.get(mappedSlug) : null) ?? deptByCode.get(subject) ?? null
  }

  const coursePayloads = new Map<string, Record<string, unknown>>()
  for (const { course } of sourceCourses) {
    coursePayloads.set(course.courseString, {
      course_number: course.courseString,
      name: course.title,
      slug: courseSlug(course.courseString),
      credits: course.credits ?? null,
      description: course.courseDescription ?? null,
      subject_code: course.subject,
      academic_level: course.academicLevelDescription ?? null,
    })
  }

  if (DRY_RUN) {
    console.log(`  Would ensure semester ${semCode} (${semName})`)
    if (missingDepartmentRows.length > 0) {
      console.log(`  Would create ${missingDepartmentRows.length} generated subject departments`)
    }
    console.log(`  Would upsert ${coursePayloads.size} courses`)
    console.log(`  Would process ${sourceSections} sections`)
    return
  }

  const { data: semester, error: semError } = await supabase
    .from('semesters')
    .upsert({
      code: semCode,
      name: semName,
      slug: semCode.toLowerCase(),
      year: YEAR,
      term: TERM_MAP[TERM] ?? TERM,
      is_current: false,
    }, { onConflict: 'code' })
    .select('id')
    .single()
  if (semError) throw new Error(`Failed to ensure semester: ${semError.message}`)

  console.log('  Upserting courses...')
  await upsertChunks('courses', [...coursePayloads.values()], 'course_number')
  const courseRows = await fetchByIn<{ id: string; course_number: string }>(
    'courses',
    'id, course_number',
    'course_number',
    [...coursePayloads.keys()],
  )
  const courseIdByNumber = new Map(courseRows.map(row => [row.course_number, row.id]))

  const courseDeptRows: Record<string, unknown>[] = []
  for (const { course } of sourceCourses) {
    const courseId = courseIdByNumber.get(course.courseString)
    const deptId = deptIdForSubject(course.subject)
    if (courseId && deptId) {
      courseDeptRows.push({ course_id: courseId, department_id: deptId, is_primary: true })
    }
  }
  console.log('  Upserting course departments...')
  await upsertChunks(
    'course_departments',
    uniqueRows(courseDeptRows, ['course_id', 'department_id']),
    'course_id,department_id',
  )

  const professorPayloads = new Map<string, Record<string, unknown>>()
  const sectionProfessorSlug = new Map<string, string>()
  for (const { course } of sourceCourses) {
    for (const section of course.sections ?? []) {
      const rawName = sectionInstructorName(section)
      if (!rawName) continue
      const normalized = normalizeName(rawName)
      const slug = professorSlug(normalized)
      professorPayloads.set(slug, {
        first_name: normalized.first,
        last_name: normalized.last,
        slug,
      })
      sectionProfessorSlug.set(`${course.courseString}:${section.index}`, slug)
    }
  }

  console.log('  Upserting professors...')
  await upsertChunks('professors', [...professorPayloads.values()], 'slug')
  const professorRows = await fetchByIn<{ id: string; slug: string }>(
    'professors',
    'id, slug',
    'slug',
    [...professorPayloads.keys()],
  )
  const professorIdBySlug = new Map(professorRows.map(row => [row.slug, row.id]))

  const professorDeptRows: Record<string, unknown>[] = []
  for (const { course } of sourceCourses) {
    const deptId = deptIdForSubject(course.subject)
    if (!deptId) continue
    for (const section of course.sections ?? []) {
      const slug = sectionProfessorSlug.get(`${course.courseString}:${section.index}`)
      const professorId = slug ? professorIdBySlug.get(slug) : null
      if (professorId) {
        professorDeptRows.push({ professor_id: professorId, department_id: deptId, is_primary: true })
      }
    }
  }
  console.log('  Upserting professor departments...')
  await upsertChunks(
    'professor_departments',
    uniqueRows(professorDeptRows, ['professor_id', 'department_id']),
    'professor_id,department_id',
  )

  const assignmentRows: Record<string, unknown>[] = []
  let sectionsWithoutInstructor = 0
  for (const { campus, course } of sourceCourses) {
    const courseId = courseIdByNumber.get(course.courseString)
    if (!courseId) continue
    const subject = course.subject
    const sourceUrl = `https://sis.rutgers.edu/soc/#courses?subject=${subject}&semester=${YEAR}${TERM}&campus=${campus}`

    for (const section of course.sections ?? []) {
      const mt = section.meetingTimes ?? []
      const slug = sectionProfessorSlug.get(`${course.courseString}:${section.index}`)
      const professorId = slug ? professorIdBySlug.get(slug) ?? null : null
      if (!professorId) sectionsWithoutInstructor++

      const openStatus: boolean | null = typeof section.openStatus === 'boolean' ? section.openStatus : null
      const rawName = sectionInstructorName(section)
      const normalizedName = rawName && slug ? normalizeName(rawName).full : null

      assignmentRows.push({
        professor_id: professorId,
        course_id: courseId,
        semester_id: semester.id,
        section_number: section.number,
        index_number: section.index,
        meeting_days: formatMeetingDays(mt) || null,
        meeting_times: formatMeetingTimes(mt) || null,
        campus: formatCampusName(mt) || section.campusCode || campus,
        location: [...new Set(mt.map((m: any) => formatLocation(m)).filter(Boolean))].join('; ') || null,
        instructor_name_raw: rawName,
        instructor_name_normalized: normalizedName,
        source: 'soc',
        source_url: sourceUrl,
        confidence: 'verified',
        status: 'active',
        open_status: openStatus,
        open_status_text: section.openStatusText ?? null,
        status_updated_at: new Date().toISOString(),
      })
    }
  }

  console.log('  Upserting teaching assignments...')
  await upsertChunks(
    'teaching_assignments',
    uniqueRows(assignmentRows, ['index_number', 'semester_id']),
    'index_number,semester_id',
  )

  console.log('Bulk ingest complete')
  console.log(`  courses considered: ${coursePayloads.size}`)
  console.log(`  professors considered: ${professorPayloads.size}`)
  console.log(`  assignments considered: ${assignmentRows.length}`)
  console.log(`  sections without instructor: ${sectionsWithoutInstructor}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
