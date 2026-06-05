-- ==========================================================================
-- Migration 002: Teaching Assignments + Academic Graph (v2)
--
-- Adds all required metadata columns to courses, semesters, and
-- teaching_assignments. Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS.
-- ==========================================================================

-- -----------------------------------------------------------------------
-- 1. Add missing columns to teaching_assignments (table already exists)
-- -----------------------------------------------------------------------
ALTER TABLE teaching_assignments ADD COLUMN IF NOT EXISTS meeting_days TEXT;
ALTER TABLE teaching_assignments ADD COLUMN IF NOT EXISTS meeting_times TEXT;
ALTER TABLE teaching_assignments ADD COLUMN IF NOT EXISTS campus TEXT;
ALTER TABLE teaching_assignments ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE teaching_assignments ADD COLUMN IF NOT EXISTS instructor_name_normalized TEXT;
ALTER TABLE teaching_assignments ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE teaching_assignments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE teaching_assignments ADD COLUMN IF NOT EXISTS index_number TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ta_course
  ON teaching_assignments (course_id);
CREATE INDEX IF NOT EXISTS idx_ta_professor
  ON teaching_assignments (professor_id);
CREATE INDEX IF NOT EXISTS idx_ta_semester
  ON teaching_assignments (semester_id);
CREATE INDEX IF NOT EXISTS idx_ta_course_semester
  ON teaching_assignments (course_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_ta_professor_course
  ON teaching_assignments (professor_id, course_id);
CREATE INDEX IF NOT EXISTS idx_ta_index_number
  ON teaching_assignments (index_number);

-- -----------------------------------------------------------------------
-- 2. Add metadata columns to courses
-- -----------------------------------------------------------------------
ALTER TABLE courses ADD COLUMN IF NOT EXISTS subject_code TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS academic_level TEXT;

CREATE INDEX IF NOT EXISTS idx_courses_subject_code
  ON courses (subject_code);

-- -----------------------------------------------------------------------
-- 3. Add metadata columns to semesters
-- -----------------------------------------------------------------------
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS term TEXT;

-- -----------------------------------------------------------------------
-- 4. Add search support on professors
-- -----------------------------------------------------------------------
ALTER TABLE professors ADD COLUMN IF NOT EXISTS search_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_professors_last_name
  ON professors (last_name);
