#!/usr/bin/env -S npx tsx
/**
 * Data-quality audit for the Rutgers RMP app.
 * Read-only — no data is mutated.
 *
 * Usage:
 *   npm run audit:data
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ── env loader (same pattern as enrich-rmp.ts) ────────────────────────────────
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('\x1b[31mERROR:\x1b[0m Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const db = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Must match CACHE_DAYS in app/api/analyze/route.ts
const CACHE_DAYS = 30

// ── result types ──────────────────────────────────────────────────────────────
type Severity = 'OK' | 'NOTE' | 'WARN' | 'ERROR'

interface Result {
  check: string
  count: number
  samples: Record<string, unknown>[]
  severity: Severity
}

const results: Result[] = []
const PAGE_SIZE = 1000

function record(check: string, rows: Record<string, unknown>[], severity: Severity = 'WARN') {
  results.push({ check, count: rows.length, samples: rows.slice(0, 3), severity })
}

function pad(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width - 2) + '… ' : str.padEnd(width)
}

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`Failed to fetch ${table}: ${error.message}`)
    }

    const page = (data ?? []) as T[]
    rows.push(...page)

    if (page.length < PAGE_SIZE) break
  }

  return rows
}

// ── main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n\x1b[1mRutgers RMP — Data Quality Audit\x1b[0m')
  console.log('Read-only. No data will be modified.\n')

  // Fetch core tables in parallel to share across checks
  const [rawProfs, rawCourses, rawDepts, rawCd, rawPd, rawTa, rawCache] = await Promise.all([
    fetchAll<ProfessorRow>('professors', 'id, first_name, last_name, slug, rmp_id'),
    fetchAll<CourseRow>('courses', 'id, course_number, name, slug'),
    fetchAll<DepartmentRow>('departments', 'id, code, name, slug'),
    fetchAll<CourseDepartmentRow>('course_departments', 'course_id, department_id'),
    fetchAll<ProfessorDepartmentRow>('professor_departments', 'professor_id, department_id'),
    fetchAll<TeachingAssignmentRow>(
      'teaching_assignments',
      'id, professor_id, course_id, index_number, instructor_name_raw, instructor_name_normalized',
    ),
    fetchAll<ProfessorCacheRow>('professor_cache', 'id, rmp_id, first_name, last_name, cached_at'),
  ])

  const profs = rawProfs
  const courses = rawCourses
  const depts = rawDepts
  const tas = rawTa
  const cache = rawCache

  const profIdSet = new Set(profs.map(p => p.id))
  const courseIdSet = new Set(courses.map(c => c.id))
  const rmpIdSet = new Set(profs.filter(p => p.rmp_id).map(p => p.rmp_id as string))
  const linkedCourseSet = new Set(rawCd.map(r => r.course_id))
  const linkedDeptSet = new Set(rawPd.map(r => r.department_id))
  const departmentIdsByCourse = new Map<string, string[]>()
  for (const row of rawCd) {
    const list = departmentIdsByCourse.get(row.course_id) ?? []
    list.push(row.department_id)
    departmentIdsByCourse.set(row.course_id, list)
  }
  const deptsWithNamedSections = new Set<string>()
  for (const assignment of tas) {
    if (!assignment.course_id || !hasInstructorText(assignment)) continue
    for (const departmentId of departmentIdsByCourse.get(assignment.course_id) ?? []) {
      deptsWithNamedSections.add(departmentId)
    }
  }

  // ── 1. Duplicate professors by normalized full name ─────────────────────────
  const byName: Record<string, { id: string; slug: string }[]> = {}
  for (const p of profs) {
    const key = `${(p.first_name ?? '').toLowerCase().trim()} ${(p.last_name ?? '').toLowerCase().trim()}`.trim()
    if (!key) continue
    if (!byName[key]) byName[key] = []
    byName[key].push({ id: p.id, slug: p.slug })
  }
  record(
    'Duplicate professors by normalized name',
    Object.entries(byName)
      .filter(([, ps]) => ps.length > 1)
      .map(([name, ps]) => ({ name, count: ps.length, ids: ps.map(p => p.id).join(', ') })),
  )

  // ── 2. Duplicate professor slugs ────────────────────────────────────────────
  const profSlugCounts: Record<string, number> = {}
  for (const p of profs) profSlugCounts[p.slug] = (profSlugCounts[p.slug] ?? 0) + 1
  record(
    'Duplicate professor slugs',
    Object.entries(profSlugCounts)
      .filter(([, n]) => n > 1)
      .map(([slug, count]) => ({ slug, count })),
  )

  // ── 3. Duplicate course slugs ───────────────────────────────────────────────
  const courseSlugCounts: Record<string, number> = {}
  for (const c of courses) courseSlugCounts[c.slug] = (courseSlugCounts[c.slug] ?? 0) + 1
  record(
    'Duplicate course slugs',
    Object.entries(courseSlugCounts)
      .filter(([, n]) => n > 1)
      .map(([slug, count]) => ({ slug, count })),
  )

  // ── 4. Professors with no name at all ───────────────────────────────────────
  record(
    'Professors with both first_name and last_name empty',
    profs
      .filter(p => !p.first_name?.trim() && !p.last_name?.trim())
      .map(p => ({ id: p.id, slug: p.slug })),
    'ERROR',
  )

  // ── 5. Professors with empty first_name but a last_name ─────────────────────
  record(
    'Professors with empty first_name from source data',
    profs
      .filter(p => !p.first_name?.trim() && !!p.last_name?.trim())
      .map(p => ({ id: p.id, last_name: p.last_name, slug: p.slug })),
    'NOTE',
  )

  // ── 6. Courses without department links ─────────────────────────────────────
  record(
    'Courses without department link',
    courses
      .filter(c => !linkedCourseSet.has(c.id))
      .map(c => ({ id: c.id, course_number: c.course_number, name: c.name })),
    'ERROR',
  )

  // ── 7. Departments without professors ───────────────────────────────────────
  record(
    'Departments without professors but with named sections',
    depts
      .filter(d => !linkedDeptSet.has(d.id) && deptsWithNamedSections.has(d.id))
      .map(d => ({ id: d.id, code: d.code, name: d.name })),
    'ERROR',
  )

  record(
    'Departments without professors and no named sections',
    depts
      .filter(d => !linkedDeptSet.has(d.id) && !deptsWithNamedSections.has(d.id))
      .map(d => ({ id: d.id, code: d.code, name: d.name })),
    'NOTE',
  )

  // ── 8. Teaching assignments with instructor text but null professor_id ──────
  record(
    'Teaching assignments with instructor text but null professor_id',
    tas
      .filter(t => t.professor_id == null && hasInstructorText(t))
      .map(t => ({
        id: t.id,
        index_number: t.index_number,
        course_id: t.course_id,
        instructor_name_raw: t.instructor_name_raw,
      })),
    'ERROR',
  )

  // ── 9. Teaching assignments with blank instructor data ──────────────────────
  record(
    'Teaching assignments with blank instructor data',
    tas
      .filter(t => t.professor_id == null && !hasInstructorText(t))
      .map(t => ({ id: t.id, index_number: t.index_number, course_id: t.course_id })),
    'NOTE',
  )

  // ── 10. Teaching assignments with null course_id ────────────────────────────
  record(
    'Teaching assignments with null course_id',
    tas
      .filter(t => t.course_id == null)
      .map(t => ({ id: t.id, index_number: t.index_number, professor_id: t.professor_id })),
    'ERROR',
  )

  // ── 11. Orphaned TAs — professor_id not in professors ──────────────────────
  record(
    'Orphaned teaching_assignments (professor_id missing)',
    tas
      .filter(t => t.professor_id != null && !profIdSet.has(t.professor_id))
      .map(t => ({ id: t.id, professor_id: t.professor_id })),
    'ERROR',
  )

  // ── 12. Orphaned TAs — course_id not in courses ────────────────────────────
  record(
    'Orphaned teaching_assignments (course_id missing)',
    tas
      .filter(t => t.course_id != null && !courseIdSet.has(t.course_id))
      .map(t => ({ id: t.id, course_id: t.course_id })),
    'ERROR',
  )

  // ── 13. professor_cache rows not linked to any professor ───────────────────
  record(
    'professor_cache rows not linked to any professor',
    cache
      .filter(c => !rmpIdSet.has(c.rmp_id))
      .map(c => ({ rmp_id: c.rmp_id, name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() })),
  )

  // ── 14. Stale professor_cache entries ──────────────────────────────────────
  const staleCutoff = new Date(Date.now() - CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  record(
    `Stale professor_cache (older than ${CACHE_DAYS} days)`,
    cache
      .filter(c => c.cached_at && c.cached_at < staleCutoff)
      .map(c => ({
        rmp_id: c.rmp_id,
        name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
        cached_at: c.cached_at?.slice(0, 10),
      })),
  )

  // ── 15. Reviews linked to non-existent professors ──────────────────────────
  const reviewRows = (await fetchAll<ReviewRow>('reviews', 'id, professor_id'))
    .filter(r => r.professor_id != null)
  record(
    'Reviews with professor_id not in professors',
    reviewRows
      .filter(r => !profIdSet.has(r.professor_id))
      .map(r => ({ id: r.id, professor_id: r.professor_id })),
    'ERROR',
  )

  // ── 16. user_submissions with invalid course_id ────────────────────────────
  const subRows = (await fetchAll<SubmissionRow>('user_submissions', 'id, course_id, professor_name, status'))
    .filter(s => s.course_id != null)
  record(
    'user_submissions with invalid course_id',
    subRows
      .filter(s => !courseIdSet.has(s.course_id))
      .map(s => ({ id: s.id, course_id: s.course_id, professor_name: s.professor_name })),
  )

  // ── print table ──────────────────────────────────────────────────────────────
  const W = 64
  const divider = '─'.repeat(W + 18)

  console.log(divider)
  console.log(pad('Check', W) + pad('Count', 8) + 'Status')
  console.log(divider)

  for (const r of results) {
    const statusStr =
      r.count === 0
        ? '\x1b[32mOK\x1b[0m'
        : r.severity === 'ERROR'
          ? '\x1b[31mERROR\x1b[0m'
          : r.severity === 'WARN'
            ? '\x1b[33mWARN\x1b[0m'
            : '\x1b[36mNOTE\x1b[0m'
    console.log(pad(r.check, W) + pad(String(r.count), 8) + statusStr)
    if (r.count > 0) {
      for (const s of r.samples) {
        console.log(`  └─ ${JSON.stringify(s)}`)
      }
      if (r.count > 3) console.log(`  └─ …and ${r.count - 3} more`)
    }
  }

  console.log(divider)

  const errors = results.filter(r => r.count > 0 && r.severity === 'ERROR').length
  const warns = results.filter(r => r.count > 0 && r.severity === 'WARN').length
  const notes = results.filter(r => r.count > 0 && r.severity === 'NOTE').length
  const ok = results.filter(r => r.count === 0).length

  console.log(`\n${ok} passed · ${notes} note${notes !== 1 ? 's' : ''} · ${warns} warning${warns !== 1 ? 's' : ''} · ${errors} error${errors !== 1 ? 's' : ''}`)

  if (errors > 0) {
    console.log('\x1b[31mData integrity issues found — fix before deploying.\x1b[0m\n')
    process.exit(1)
  } else if (warns > 0) {
    console.log('\x1b[33mSome warnings found — review samples above.\x1b[0m\n')
  } else if (notes > 0) {
    console.log('\x1b[36mOnly source-limited notes remain.\x1b[0m\n')
  } else {
    console.log('\x1b[32mAll checks passed!\x1b[0m\n')
  }
}

function hasInstructorText(assignment: TeachingAssignmentRow): boolean {
  return Boolean(assignment.instructor_name_raw?.trim() || assignment.instructor_name_normalized?.trim())
}

run().catch(err => {
  console.error('\x1b[31mAudit failed:\x1b[0m', err)
  process.exit(1)
})

interface ProfessorRow {
  id: string
  first_name: string | null
  last_name: string | null
  slug: string
  rmp_id: string | null
}

interface CourseRow {
  id: string
  course_number: string
  name: string
  slug: string
}

interface DepartmentRow {
  id: string
  code: string
  name: string
  slug: string
}

interface CourseDepartmentRow {
  course_id: string
  department_id: string
}

interface ProfessorDepartmentRow {
  professor_id: string
  department_id: string
}

interface TeachingAssignmentRow {
  id: string
  professor_id: string | null
  course_id: string | null
  index_number: string | null
  instructor_name_raw: string | null
  instructor_name_normalized: string | null
}

interface ProfessorCacheRow {
  id: string
  rmp_id: string
  first_name: string | null
  last_name: string | null
  cached_at: string | null
}

interface ReviewRow {
  id: string
  professor_id: string
}

interface SubmissionRow {
  id: string
  course_id: string
  professor_name: string | null
  status: string | null
}
