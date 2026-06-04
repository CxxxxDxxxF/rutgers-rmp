-- 2A: Group A Department Backfill
-- 31 data-verified subject codes → existing departments
-- Reconstructed from database teaching data after session compaction.
-- Excludes: 148 (GA appointments), 370 (GA+wrong school), 501 (split schools),
--           216 (RBS/business mismatch), 710 (generic engineering bucket)
-- DRY RUN: 472 course_dept rows, 411 professor_dept rows, 0 conflicts
--
-- ROLLBACK:
--   DELETE FROM professor_departments
--     WHERE (professor_id, department_id) IN (
--       SELECT DISTINCT p.id, m.dept_id
--       FROM courses c
--       JOIN mapping m ON split_part(c.course_number,':',2) = m.subject_code
--       JOIN teaching_assignments ta ON ta.course_id = c.id
--       JOIN professors p ON p.id = ta.professor_id
--       WHERE NOT EXISTS (SELECT 1 FROM course_departments cd WHERE cd.course_id = c.id)
--     );
--   DELETE FROM course_departments
--     WHERE course_id IN (
--       SELECT c.id FROM courses c
--       WHERE split_part(c.course_number,':',2) IN (
--         '011','050','098','136','146','185','211','259','293','310',
--         '374','460','506','544','547','590','635','642','652','681',
--         '712','718','761','776','816','820','821','848','851','954','958'
--       ) AND NOT EXISTS (SELECT 1 FROM course_departments cd WHERE cd.course_id = c.id)
--     );

-- Step 1: course_departments
INSERT INTO course_departments (course_id, department_id, is_primary)
SELECT DISTINCT c.id, m.dept_id::uuid, true
FROM courses c
JOIN (VALUES
  ('011', 'bace8ff0-a040-43df-a290-4bc202377971'), -- ACC
  ('050', '6211ba53-d716-484b-8307-1675bb223105'), -- AFRS
  ('098', '6211ba53-d716-484b-8307-1675bb223105'), -- AFRS
  ('136', 'ab9de9d7-5895-4ab2-b6fd-49a46bd95861'), -- STAT
  ('146', '7da5da0c-878c-46d5-b1cc-d50b4c7e5963'), -- BIO
  ('185', 'e109a56f-3764-4617-a6b1-1023d814f1d4'), -- PSY
  ('211', '47f48f15-993e-44ce-b245-960b80547bf5'), -- JURN
  ('259', 'e3836f84-a892-4b45-86f9-9d6b3ea32769'), -- ED
  ('293', '7a270c5f-022c-4f1f-be0d-73b581e200d6'), -- POL
  ('310', 'e45188f6-fbcb-4130-829f-fdb4a5bd4019'), -- MATH
  ('374', '31ce504d-07e2-406b-99e0-5b916cad53a5'), -- NUTR
  ('460', 'b36b627c-986d-4cff-b69d-e0880d5bd16b'), -- CHEM
  ('506', '546e463d-7b7f-4b57-b5c9-e760f340f0f6'), -- PH
  ('544', 'ab9de9d7-5895-4ab2-b6fd-49a46bd95861'), -- STAT
  ('547', 'a14bb0cf-9575-476d-a991-d2a6312a9e58'), -- CS
  ('590', '6211ba53-d716-484b-8307-1675bb223105'), -- AFRS
  ('635', 'b36b627c-986d-4cff-b69d-e0880d5bd16b'), -- CHEM
  ('642', 'e45188f6-fbcb-4130-829f-fdb4a5bd4019'), -- MATH
  ('652', '57139bcf-3aaa-4be8-be0d-59091e724a95'), -- PHIL
  ('681', 'f26d164b-2a49-4e37-918c-9ed651c26234'), -- GEN
  ('712', '546e463d-7b7f-4b57-b5c9-e760f340f0f6'), -- PH
  ('718', '31ce504d-07e2-406b-99e0-5b916cad53a5'), -- NUTR
  ('761', '31ce504d-07e2-406b-99e0-5b916cad53a5'), -- NUTR
  ('776', '7a270c5f-022c-4f1f-be0d-73b581e200d6'), -- POL
  ('816', 'a14bb0cf-9575-476d-a991-d2a6312a9e58'), -- CS
  ('820', 'e109a56f-3764-4617-a6b1-1023d814f1d4'), -- PSY
  ('821', 'e109a56f-3764-4617-a6b1-1023d814f1d4'), -- PSY
  ('848', 'b36b627c-986d-4cff-b69d-e0880d5bd16b'), -- CHEM
  ('851', '651434d0-6ee6-43ec-909b-eb0554c77bae'), -- FIN
  ('954', 'ab9de9d7-5895-4ab2-b6fd-49a46bd95861'), -- STAT
  ('958', 'ab9de9d7-5895-4ab2-b6fd-49a46bd95861')  -- STAT
) AS m(subject_code, dept_id) ON split_part(c.course_number, ':', 2) = m.subject_code
WHERE NOT EXISTS (SELECT 1 FROM course_departments cd WHERE cd.course_id = c.id)
ON CONFLICT (course_id, department_id) DO NOTHING;

-- Step 2: professor_departments
-- is_primary=false for backfill rows (professors with existing depts keep their primary;
-- professors with no dept get a secondary which can be promoted in a follow-up pass)
INSERT INTO professor_departments (professor_id, department_id, is_primary)
SELECT DISTINCT p.id, m.dept_id::uuid, false
FROM courses c
JOIN (VALUES
  ('011', 'bace8ff0-a040-43df-a290-4bc202377971'),
  ('050', '6211ba53-d716-484b-8307-1675bb223105'),
  ('098', '6211ba53-d716-484b-8307-1675bb223105'),
  ('136', 'ab9de9d7-5895-4ab2-b6fd-49a46bd95861'),
  ('146', '7da5da0c-878c-46d5-b1cc-d50b4c7e5963'),
  ('185', 'e109a56f-3764-4617-a6b1-1023d814f1d4'),
  ('211', '47f48f15-993e-44ce-b245-960b80547bf5'),
  ('259', 'e3836f84-a892-4b45-86f9-9d6b3ea32769'),
  ('293', '7a270c5f-022c-4f1f-be0d-73b581e200d6'),
  ('310', 'e45188f6-fbcb-4130-829f-fdb4a5bd4019'),
  ('374', '31ce504d-07e2-406b-99e0-5b916cad53a5'),
  ('460', 'b36b627c-986d-4cff-b69d-e0880d5bd16b'),
  ('506', '546e463d-7b7f-4b57-b5c9-e760f340f0f6'),
  ('544', 'ab9de9d7-5895-4ab2-b6fd-49a46bd95861'),
  ('547', 'a14bb0cf-9575-476d-a991-d2a6312a9e58'),
  ('590', '6211ba53-d716-484b-8307-1675bb223105'),
  ('635', 'b36b627c-986d-4cff-b69d-e0880d5bd16b'),
  ('642', 'e45188f6-fbcb-4130-829f-fdb4a5bd4019'),
  ('652', '57139bcf-3aaa-4be8-be0d-59091e724a95'),
  ('681', 'f26d164b-2a49-4e37-918c-9ed651c26234'),
  ('712', '546e463d-7b7f-4b57-b5c9-e760f340f0f6'),
  ('718', '31ce504d-07e2-406b-99e0-5b916cad53a5'),
  ('761', '31ce504d-07e2-406b-99e0-5b916cad53a5'),
  ('776', '7a270c5f-022c-4f1f-be0d-73b581e200d6'),
  ('816', 'a14bb0cf-9575-476d-a991-d2a6312a9e58'),
  ('820', 'e109a56f-3764-4617-a6b1-1023d814f1d4'),
  ('821', 'e109a56f-3764-4617-a6b1-1023d814f1d4'),
  ('848', 'b36b627c-986d-4cff-b69d-e0880d5bd16b'),
  ('851', '651434d0-6ee6-43ec-909b-eb0554c77bae'),
  ('954', 'ab9de9d7-5895-4ab2-b6fd-49a46bd95861'),
  ('958', 'ab9de9d7-5895-4ab2-b6fd-49a46bd95861')
) AS m(subject_code, dept_id) ON split_part(c.course_number, ':', 2) = m.subject_code
JOIN teaching_assignments ta ON ta.course_id = c.id
JOIN professors p ON p.id = ta.professor_id
WHERE NOT EXISTS (SELECT 1 FROM course_departments cd WHERE cd.course_id = c.id)
  AND NOT EXISTS (
    SELECT 1 FROM professor_departments pd
    WHERE pd.professor_id = p.id AND pd.department_id = m.dept_id::uuid
  )
ON CONFLICT (professor_id, department_id) DO NOTHING;
