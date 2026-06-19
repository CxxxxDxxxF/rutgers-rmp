#!/usr/bin/env -S npx tsx
/**
 * Backfill course_departments/professor_departments from deterministic Rutgers
 * SOC subject-code mappings. Defaults to dry-run; pass --write to mutate data.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { RUTGERS_SUBJECT_TO_DEPT_SLUG } from '../lib/rutgers-subject-map'

function loadEnvFile(fileName: string) {
  const filePath = path.resolve(process.cwd(), fileName)
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const sep = trimmed.indexOf('=')
    if (sep === -1) continue
    const key = trimmed.slice(0, sep)
    const value = trimmed.slice(sep + 1).replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const WRITE = process.argv.includes('--write')
const PAGE_SIZE = 1000

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function fetchAll<T>(label: string, query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${label} query failed: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE_SIZE) return rows
  }
}

function subjectFromCourse(course: CourseRow) {
  return course.subject_code ?? course.course_number.split(':')[1] ?? null
}

function chunk<T>(rows: T[], size = 500) {
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size))
  return chunks
}

async function run() {
  const [courses, courseLinks, departments] = await Promise.all([
    fetchAll<CourseRow>('courses', (from, to) =>
      db.from('courses').select('id, course_number, subject_code').range(from, to)
    ),
    fetchAll<CourseDepartmentRow>('course_departments', (from, to) =>
      db.from('course_departments').select('course_id, department_id').range(from, to)
    ),
    fetchAll<DepartmentRow>('departments', (from, to) =>
      db.from('departments').select('id, slug').range(from, to)
    ),
  ])

  const linkedCourses = new Set(courseLinks.map(row => row.course_id))
  const deptBySlug = new Map(departments.map(row => [row.slug, row.id]))
  const courseDeptRows: CourseDepartmentInsert[] = []

  for (const course of courses) {
    if (linkedCourses.has(course.id)) continue
    const subject = subjectFromCourse(course)
    const slug = subject ? RUTGERS_SUBJECT_TO_DEPT_SLUG[subject] : null
    const departmentId = slug ? deptBySlug.get(slug) : null
    if (!departmentId) continue
    courseDeptRows.push({ course_id: course.id, department_id: departmentId, is_primary: true })
  }

  const courseIdsToLink = new Set(courseDeptRows.map(row => row.course_id))
  const departmentByCourse = new Map(courseDeptRows.map(row => [row.course_id, row.department_id]))
  const assignments = courseIdsToLink.size === 0
    ? []
    : await fetchAll<AssignmentRow>('teaching_assignments', (from, to) =>
        db
          .from('teaching_assignments')
          .select('course_id, professor_id')
          .not('professor_id', 'is', null)
          .range(from, to)
      )

  const professorDeptKeys = new Set<string>()
  const professorDeptRows: ProfessorDepartmentInsert[] = []
  for (const assignment of assignments) {
    if (!courseIdsToLink.has(assignment.course_id)) continue
    const departmentId = departmentByCourse.get(assignment.course_id)
    if (!departmentId) continue
    const key = `${assignment.professor_id}:${departmentId}`
    if (professorDeptKeys.has(key)) continue
    professorDeptKeys.add(key)
    professorDeptRows.push({
      professor_id: assignment.professor_id,
      department_id: departmentId,
      is_primary: false,
    })
  }

  console.log(`course department links to add: ${courseDeptRows.length}`)
  console.log(`professor department links to add/update: ${professorDeptRows.length}`)

  if (!WRITE) {
    console.log('dry-run only; pass --write to apply')
    return
  }

  for (const rows of chunk(courseDeptRows)) {
    const { error } = await db.from('course_departments').insert(rows)
    if (error) throw new Error(`course_departments insert failed: ${error.message}`)
  }

  for (const rows of chunk(professorDeptRows)) {
    const { error } = await db
      .from('professor_departments')
      .upsert(rows, { onConflict: 'professor_id,department_id' })
    if (error) throw new Error(`professor_departments upsert failed: ${error.message}`)
  }

  console.log('backfill complete')
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

interface CourseRow {
  id: string
  course_number: string
  subject_code: string | null
}

interface CourseDepartmentRow {
  course_id: string
  department_id: string
}

interface DepartmentRow {
  id: string
  slug: string
}

interface AssignmentRow {
  course_id: string
  professor_id: string
}

interface CourseDepartmentInsert {
  course_id: string
  department_id: string
  is_primary: boolean
}

interface ProfessorDepartmentInsert {
  professor_id: string
  department_id: string
  is_primary: boolean
}
