-- Normalize departments.school into canonical Rutgers–New Brunswick school names.
--
-- The SOC subject backfill (scripts/backfill-rutgers-subject-departments.ts)
-- previously fanned out across NB, NK, and CM campuses for subject metadata,
-- so New Brunswick courses inherited Camden/Newark and undergraduate/graduate
-- variant school labels. This collapses the near-duplicate values into clean
-- canonical names and removes any Camden/Newark references. The underlying
-- course and section data is New Brunswick only; only the cosmetic school label
-- is corrected here.

-- School of Arts and Sciences (collapse ampersand variant)
UPDATE departments SET school = 'School of Arts and Sciences'
WHERE school IN ('School of Arts & Sciences', 'School of Arts and Sciences');

-- School of Communication and Information
UPDATE departments SET school = 'School of Communication and Information'
WHERE school IN ('School of Communication', 'School of Communication and Information');

-- Mason Gross School of the Arts
UPDATE departments SET school = 'Mason Gross School of the Arts'
WHERE school IN ('Mason Gross School of the Arts', 'Mason Gross School of the Arts (Undergrad)');

-- Rutgers Business School (drop Newark/New Brunswick + grad/campus suffixes)
UPDATE departments SET school = 'Rutgers Business School'
WHERE school LIKE 'Rutgers Business School%';

-- School of Management and Labor Relations
UPDATE departments SET school = 'School of Management and Labor Relations'
WHERE school LIKE 'School of Management and Labor Relations%';

-- Edward J. Bloustein School of Planning and Public Policy
UPDATE departments SET school = 'Edward J. Bloustein School of Planning and Public Policy'
WHERE school = 'Bloustein School'
   OR school LIKE 'Edward J. Bloustein School of Planning and%Public Policy%';

-- Graduate School of Applied and Professional Psychology (collapse double space)
UPDATE departments SET school = 'Graduate School of Applied and Professional Psychology'
WHERE school LIKE 'Graduate School of Applied and Professional%Psychology';

-- School of Graduate Studies (collapse New Brunswick label and any Camden/Newark
-- graduate-school labels that leaked in from cross-listed subject metadata)
UPDATE departments SET school = 'School of Graduate Studies'
WHERE school IN (
  'The School of Graduate Studies - New Brunswick',
  'The Graduate School - Camden',
  'The Graduate School - Newark'
);

-- Junk / placeholder school labels fall back to "Other"
UPDATE departments SET school = 'Other'
WHERE school IS NULL OR school IN ('65', 'Rutgers University', '');
