#!/usr/bin/env -S npx tsx
/**
 * Create exact Rutgers SOC subject departments for courses that still have no
 * department link after curated mapping. Defaults to dry-run; pass --write to
 * mutate data.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

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
const YEAR = '2025'
const TERM = '9'
const CAMPUSES = ['NB', 'NK', 'CM']

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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

function mostCommon(values: string[]) {
  const counts = new Map<string, number>()
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

function chunk<T>(rows: T[], size = 500) {
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size))
  return chunks
}

async function loadSocSubjectMetadata(subjects: Set<string>) {
  const metadata = new Map<string, { names: string[]; schools: string[] }>()

  for (const campus of CAMPUSES) {
    const url = `https://classes.rutgers.edu/soc/api/courses.json?year=${YEAR}&term=${TERM}&campus=${campus}`
    const response = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } })
    if (!response.ok) throw new Error(`Rutgers SOC ${campus} fetch failed: HTTP ${response.status}`)
    const rows = await response.json() as SocCourse[]
    for (const row of rows) {
      if (!subjects.has(row.subject)) continue
      const item = metadata.get(row.subject) ?? { names: [], schools: [] }
      if (row.subjectDescription?.trim()) item.names.push(row.subjectDescription.trim())
      if (row.school?.description?.trim()) item.schools.push(row.school.description.trim())
      metadata.set(row.subject, item)
    }
  }

  return metadata
}

async function run() {
  const [courses, courseLinks, departments] = await Promise.all([
    fetchAll<CourseRow>('courses', (from, to) =>
      db.from('courses').select('id, course_number, subject_code').range(from, to)
    ),
    fetchAll<CourseDepartmentRow>('course_departments', (from, to) =>
      db.from('course_departments').select('course_id').range(from, to)
    ),
    fetchAll<DepartmentRow>('departments', (from, to) =>
      db.from('departments').select('id, slug, code').range(from, to)
    ),
  ])

  const linkedCourses = new Set(courseLinks.map(row => row.course_id))
  const unlinkedCourses = courses.filter(course => !linkedCourses.has(course.id))
  const subjects = new Set(unlinkedCourses.map(subjectFromCourse).filter((value): value is string => !!value))
  const metadata = await loadSocSubjectMetadata(subjects)
  const existingSlugs = new Set(departments.map(row => row.slug))
  const existingByCode = new Map(departments.filter(row => row.code).map(row => [row.code, row]))

  const departmentsToCreate: DepartmentInsert[] = []
  const departmentBySubject = new Map<string, DepartmentRow | DepartmentInsert>()

  for (const subject of [...subjects].sort()) {
    const existing = existingByCode.get(subject)
    if (existing) {
      departmentBySubject.set(subject, existing)
      continue
    }

    const info = metadata.get(subject)
    const name = mostCommon(info?.names ?? []) ?? `Rutgers Subject ${subject}`
    const school = mostCommon(info?.schools ?? []) ?? 'Rutgers University'
    let slug = `rutgers-${subject}-${slugify(name)}`
    let suffix = 2
    while (existingSlugs.has(slug)) {
      slug = `rutgers-${subject}-${slugify(name)}-${suffix}`
      suffix++
    }
    existingSlugs.add(slug)

    const row = {
      code: subject,
      name,
      full_name: name,
      school,
      slug,
      description: `Rutgers Schedule of Classes subject ${subject}.`,
    }
    departmentsToCreate.push(row)
    departmentBySubject.set(subject, row)
  }

  const courseLinksToCreate = unlinkedCourses
    .map(course => {
      const subject = subjectFromCourse(course)
      const department = subject ? departmentBySubject.get(subject) : null
      return department ? { course_id: course.id, department, subject } : null
    })
    .filter((value): value is PendingCourseDepartment => !!value)

  console.log(`departments to create: ${departmentsToCreate.length}`)
  console.log(`course department links to add: ${courseLinksToCreate.length}`)

  if (!WRITE) {
    console.log('dry-run only; pass --write to apply')
    return
  }

  const createdBySlug = new Map<string, DepartmentRow>()
  for (const rows of chunk(departmentsToCreate)) {
    const { data, error } = await db
      .from('departments')
      .insert(rows)
      .select('id, slug, code')
    if (error) throw new Error(`departments insert failed: ${error.message}`)
    for (const row of data ?? []) createdBySlug.set(row.slug, row)
  }

  const departmentIdBySubject = new Map<string, string>()
  for (const [subject, department] of departmentBySubject.entries()) {
    if ('id' in department) {
      departmentIdBySubject.set(subject, department.id)
    } else {
      const created = createdBySlug.get(department.slug)
      if (created) departmentIdBySubject.set(subject, created.id)
    }
  }

  const courseRows = courseLinksToCreate
    .map(row => {
      const departmentId = departmentIdBySubject.get(row.subject)
      return departmentId
        ? { course_id: row.course_id, department_id: departmentId, is_primary: true }
        : null
    })
    .filter((value): value is CourseDepartmentInsert => !!value)

  for (const rows of chunk(courseRows)) {
    const { error } = await db.from('course_departments').insert(rows)
    if (error) throw new Error(`course_departments insert failed: ${error.message}`)
  }

  const linkedCourseIds = new Set(courseRows.map(row => row.course_id))
  const assignments = linkedCourseIds.size === 0
    ? []
    : await fetchAll<AssignmentRow>('teaching_assignments', (from, to) =>
        db
          .from('teaching_assignments')
          .select('course_id, professor_id')
          .not('professor_id', 'is', null)
          .range(from, to)
      )

  const courseSubject = new Map(unlinkedCourses.map(course => [course.id, subjectFromCourse(course)]))
  const professorDeptKeys = new Set<string>()
  const professorRows: ProfessorDepartmentInsert[] = []
  for (const assignment of assignments) {
    if (!linkedCourseIds.has(assignment.course_id)) continue
    const subject = courseSubject.get(assignment.course_id)
    const departmentId = subject ? departmentIdBySubject.get(subject) : null
    if (!departmentId) continue
    const key = `${assignment.professor_id}:${departmentId}`
    if (professorDeptKeys.has(key)) continue
    professorDeptKeys.add(key)
    professorRows.push({
      professor_id: assignment.professor_id,
      department_id: departmentId,
      is_primary: false,
    })
  }

  for (const rows of chunk(professorRows)) {
    const { error } = await db
      .from('professor_departments')
      .upsert(rows, { onConflict: 'professor_id,department_id' })
    if (error) throw new Error(`professor_departments upsert failed: ${error.message}`)
  }

  console.log(`created departments: ${departmentsToCreate.length}`)
  console.log(`created course department links: ${courseRows.length}`)
  console.log(`created/updated professor department links: ${professorRows.length}`)
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
}

interface DepartmentRow {
  id: string
  slug: string
  code: string | null
}

interface DepartmentInsert {
  code: string
  name: string
  full_name: string
  school: string
  slug: string
  description: string
}

interface PendingCourseDepartment {
  course_id: string
  department: DepartmentRow | DepartmentInsert
  subject: string
}

interface CourseDepartmentInsert {
  course_id: string
  department_id: string
  is_primary: boolean
}

interface AssignmentRow {
  course_id: string
  professor_id: string
}

interface ProfessorDepartmentInsert {
  professor_id: string
  department_id: string
  is_primary: boolean
}

interface SocCourse {
  subject: string
  subjectDescription?: string
  school?: {
    description?: string
  }
}
