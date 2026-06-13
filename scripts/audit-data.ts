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
type Severity = 'OK' | 'WARN' | 'ERROR'

interface Result {
  check: string
  count: number
  samples: Record<string, unknown>[]
  severity: Severity
}

const results: Result[] = []

function record(check: string, rows: Record<string, unknown>[], severity: Severity = 'WARN') {
  results.push({ check, count: rows.length, samples: rows.slice(0, 3), severity })
}

function pad(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width - 2) + '… ' : str.padEnd(width)
}

// ── main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n\x1b[1mRutgers RMP — Data Quality Audit\x1b[0m')
  console.log('Read-only. No data will be modified.\n')

  // Fetch core tables in parallel to share across checks
  const [
    { data: rawProfs },
    { data: rawCourses },
    { data: rawDepts },
    { data: rawCd },
    { data: rawPd },
    { data: rawTa },
    { data: rawCache },
  ] = await Promise.all([
    db.from('professors').select('id, first_name, last_name, slug, rmp_id'),
    db.from('courses').select('id, course_number, name, slug'),
    db.from('departments').select('id, code, name, slug'),
    db.from('course_departments').select('course_id'),
    db.from('professor_departments').select('department_id'),
    db.from('teaching_assignments').select('id, professor_id, course_id, index_number'),
    db.from('professor_cache').select('id, rmp_id, first_name, last_name, cached_at'),
  ])

  const profs = rawProfs ?? []
  const courses = rawCourses ?? []
  const depts = rawDepts ?? []
  const tas = rawTa ?? []
  const cache = rawCache ?? []

  const profIdSet = new Set(profs.map(p => p.id))
  const courseIdSet = new Set(courses.map(c => c.id))
  const rmpIdSet = new Set(profs.filter(p => p.rmp_id).map(p => p.rmp_id as string))
  const linkedCourseSet = new Set((rawCd ?? []).map(r => r.course_id))
  const linkedDeptSet = new Set((rawPd ?? []).map(r => r.department_id))

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
    'Professors with empty first_name (has last_name)',
    profs
      .filter(p => !p.first_name?.trim() && !!p.last_name?.trim())
      .map(p => ({ id: p.id, last_name: p.last_name, slug: p.slug })),
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
    'Departments without professors',
    depts
      .filter(d => !linkedDeptSet.has(d.id))
      .map(d => ({ id: d.id, code: d.code, name: d.name })),
  )

  // ── 8. Teaching assignments with null professor_id ──────────────────────────
  record(
    'Teaching assignments with null professor_id',
    tas
      .filter(t => t.professor_id == null)
      .map(t => ({ id: t.id, index_number: t.index_number, course_id: t.course_id })),
    'ERROR',
  )

  // ── 9. Teaching assignments with null course_id ─────────────────────────────
  record(
    'Teaching assignments with null course_id',
    tas
      .filter(t => t.course_id == null)
      .map(t => ({ id: t.id, index_number: t.index_number, professor_id: t.professor_id })),
    'ERROR',
  )

  // ── 10. Orphaned TAs — professor_id not in professors ──────────────────────
  record(
    'Orphaned teaching_assignments (professor_id missing)',
    tas
      .filter(t => t.professor_id != null && !profIdSet.has(t.professor_id))
      .map(t => ({ id: t.id, professor_id: t.professor_id })),
    'ERROR',
  )

  // ── 11. Orphaned TAs — course_id not in courses ────────────────────────────
  record(
    'Orphaned teaching_assignments (course_id missing)',
    tas
      .filter(t => t.course_id != null && !courseIdSet.has(t.course_id))
      .map(t => ({ id: t.id, course_id: t.course_id })),
    'ERROR',
  )

  // ── 12. professor_cache rows not linked to any professor ───────────────────
  record(
    'professor_cache rows not linked to any professor',
    cache
      .filter(c => !rmpIdSet.has(c.rmp_id))
      .map(c => ({ rmp_id: c.rmp_id, name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() })),
  )

  // ── 13. Stale professor_cache entries ──────────────────────────────────────
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

  // ── 14. Reviews linked to non-existent professors ──────────────────────────
  const { data: reviewRows } = await db
    .from('reviews')
    .select('id, professor_id')
    .not('professor_id', 'is', null)
  record(
    'Reviews with professor_id not in professors',
    (reviewRows ?? [])
      .filter(r => !profIdSet.has(r.professor_id))
      .map(r => ({ id: r.id, professor_id: r.professor_id })),
    'ERROR',
  )

  // ── 15. user_submissions with invalid course_id ────────────────────────────
  const { data: subRows } = await db
    .from('user_submissions')
    .select('id, course_id, professor_name, status')
    .not('course_id', 'is', null)
  record(
    'user_submissions with invalid course_id',
    (subRows ?? [])
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
          : '\x1b[33mWARN\x1b[0m'
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
  const ok = results.filter(r => r.count === 0).length

  console.log(`\n${ok} passed · ${warns} warning${warns !== 1 ? 's' : ''} · ${errors} error${errors !== 1 ? 's' : ''}`)

  if (errors > 0) {
    console.log('\x1b[31mData integrity issues found — fix before deploying.\x1b[0m\n')
    process.exit(1)
  } else if (warns > 0) {
    console.log('\x1b[33mSome warnings found — review samples above.\x1b[0m\n')
  } else {
    console.log('\x1b[32mAll checks passed!\x1b[0m\n')
  }
}

run().catch(err => {
  console.error('\x1b[31mAudit failed:\x1b[0m', err)
  process.exit(1)
})
