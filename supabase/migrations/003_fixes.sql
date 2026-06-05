-- ==========================================================================
-- Migration 003: Data Fixes
--
-- 1. Add UNIQUE(index_number, semester_id) to teaching_assignments
-- 2. Fix 4 corrupted professor records (name/slug had spaces from no-comma SOC names)
-- 3. Backfill semesters.year, .term, .slug (all were NULL)
-- ==========================================================================

-- -----------------------------------------------------------------------
-- 1. Unique constraint on teaching_assignments
-- -----------------------------------------------------------------------
-- Pre-check for duplicates was run before applying this migration:
-- SELECT index_number, semester_id, COUNT(*) FROM teaching_assignments
-- GROUP BY index_number, semester_id HAVING COUNT(*) > 1;
-- Result: 0 rows -- safe to add constraint.

ALTER TABLE teaching_assignments
  ADD CONSTRAINT uq_ta_index_semester
  UNIQUE (index_number, semester_id);

-- -----------------------------------------------------------------------
-- 2. Fix corrupted professor records
--
-- These professors were listed in the SOC API without a comma separator
-- (e.g. "ABELLO MONEDERO" instead of "GARCIA, JOSE"), so normalizeName
-- set first=last=full=entire raw string, producing slugs with spaces.
-- -----------------------------------------------------------------------

-- ABELLO MONEDERO (likely Spanish compound surname, first name unknown)
UPDATE professors
SET
  last_name  = 'Abello Monedero',
  first_name = '',
  slug       = 'abello-monedero'
WHERE slug = 'abello monedero-abello monedero';

-- GHOLIZADEH HAMI
UPDATE professors
SET
  last_name  = 'Gholizadeh Hami',
  first_name = '',
  slug       = 'gholizadeh-hami'
WHERE slug = 'gholizadeh hami-gholizadeh hami';

-- MIRANDA GARCIA (likely Spanish compound surname)
UPDATE professors
SET
  last_name  = 'Miranda Garcia',
  first_name = '',
  slug       = 'miranda-garcia'
WHERE slug = 'miranda garcia-miranda garcia';

-- NARAYANA GANAPA
UPDATE professors
SET
  last_name  = 'Narayana Ganapa',
  first_name = '',
  slug       = 'narayana-ganapa'
WHERE slug = 'narayana ganapa-narayana ganapa';

-- -----------------------------------------------------------------------
-- 3. Backfill semesters.year, .term, .slug
-- -----------------------------------------------------------------------

UPDATE semesters SET year = 2022, term = 'fall',   slug = 'fall-2022'   WHERE code = 'F2022';
UPDATE semesters SET year = 2023, term = 'spring',  slug = 'spring-2023' WHERE code = 'S2023';
UPDATE semesters SET year = 2023, term = 'fall',   slug = 'fall-2023'   WHERE code = 'F2023';
UPDATE semesters SET year = 2024, term = 'spring',  slug = 'spring-2024' WHERE code = 'S2024';
UPDATE semesters SET year = 2024, term = 'fall',   slug = 'fall-2024'   WHERE code = 'F2024';
UPDATE semesters SET year = 2025, term = 'spring',  slug = 'spring-2025' WHERE code = 'S2025';
UPDATE semesters SET year = 2025, term = 'fall',   slug = 'fall-2025'   WHERE code = 'F2025';
