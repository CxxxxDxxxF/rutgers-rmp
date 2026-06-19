-- Add Summer 2026 to the semesters table.
-- Uses the same code/slug convention as ingest-soc.ts:
--   code = TERM_MAP[7] + year = 'SU2026', slug = lowercase code.
INSERT INTO semesters (code, name, slug, year, term, is_current)
VALUES ('SU2026', 'Summer 2026', 'su2026', 2026, 'SU', false)
ON CONFLICT (code) DO NOTHING;
