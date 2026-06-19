-- Core relational tables required before the feature migrations alter them.
-- This file is intentionally idempotent so it can run safely on databases that
-- already have the original hand-created schema.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name text NOT NULL,
  full_name text,
  school text,
  slug text UNIQUE NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS professors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text,
  last_name text,
  slug text UNIQUE NOT NULL,
  rmp_id text UNIQUE,
  cache_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_number text UNIQUE NOT NULL,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  credits numeric,
  description text,
  prerequisites text,
  subject_code text,
  academic_level text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  slug text UNIQUE,
  year integer,
  term text,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_departments (
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, department_id)
);

CREATE TABLE IF NOT EXISTS professor_departments (
  professor_id uuid NOT NULL REFERENCES professors(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (professor_id, department_id)
);

CREATE TABLE IF NOT EXISTS teaching_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid REFERENCES professors(id) ON DELETE SET NULL,
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
  semester_id uuid REFERENCES semesters(id) ON DELETE CASCADE,
  section_number text,
  source text,
  confidence text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES professors(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  reviewer_ip text,
  quality_rating integer CHECK (quality_rating BETWEEN 1 AND 5),
  difficulty_rating integer CHECK (difficulty_rating BETWEEN 1 AND 5),
  would_take_again boolean,
  grade_received text,
  comment text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  is_online boolean NOT NULL DEFAULT false,
  attendance_required boolean NOT NULL DEFAULT false,
  helpful_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'native',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid REFERENCES professors(id) ON DELETE SET NULL,
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
  semester_id uuid REFERENCES semesters(id) ON DELETE SET NULL,
  section_number text,
  submitter_ip text,
  evidence text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  upvotes integer NOT NULL DEFAULT 0,
  downvotes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE professors ADD COLUMN IF NOT EXISTS cache_id uuid;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS school text;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS prerequisites text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS subject_code text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS academic_level text;

CREATE INDEX IF NOT EXISTS idx_professors_cache_id ON professors(cache_id);
CREATE INDEX IF NOT EXISTS idx_courses_subject_code ON courses(subject_code);
CREATE INDEX IF NOT EXISTS idx_reviews_professor_id ON reviews(professor_id);
CREATE INDEX IF NOT EXISTS idx_reviews_course_id ON reviews(course_id);
CREATE INDEX IF NOT EXISTS idx_user_submissions_course_id ON user_submissions(course_id);
CREATE INDEX IF NOT EXISTS idx_user_submissions_status ON user_submissions(status);
