-- Expand subject-code → department links to cover all 128 seeded departments.
-- Backfills course_departments and professor_departments for ~50 subject codes
-- not covered by the original 20260618223316 migration.
-- Safe to re-run: ON CONFLICT DO NOTHING on both tables.

WITH mapping(subject_code, dept_slug) AS (
  VALUES
    ('013', 'rutgers-013-african-middle-eastern-and-south-asian-languages-and-literatures'),
    ('015', 'rutgers-015-environmental-and-biological-sciences'),
    ('019', 'rutgers-019-rutgers-subject-019'),
    ('020', 'rutgers-020-agriculture-and-food-systems'),
    ('035', 'rutgers-035-agricultural-and-natural-resource-management'),
    ('047', 'rutgers-047-alcohol-studies'),
    ('074', 'rutgers-074-arabic-languages'),
    ('078', 'rutgers-078-armenian'),
    ('090', 'rutgers-090-arts-and-sciences'),
    ('107', 'rutgers-107-atmospheric-science'),
    ('117', 'rutgers-117-bioenvironmental-engineering'),
    ('126', 'rutgers-126-biotechnology'),
    ('135', 'rutgers-135-business-administration'),
    ('137', 'rutgers-137-business-and-science'),
    ('140', 'rutgers-140-business-law'),
    ('165', 'rutgers-165-chinese'),
    ('175', 'rutgers-175-cinema-studies'),
    ('186', 'rutgers-186-college-teaching'),
    ('187', 'rutgers-187-college-and-university-leadership'),
    ('190', 'rutgers-190-classics'),
    ('193', 'rutgers-193-community-health-outreach'),
    ('195', 'rutgers-195-comparative-literature'),
    ('207', 'rutgers-207-dance-education'),
    ('217', 'rutgers-217-east-asian-languages-and-cultures'),
    ('255', 'education'),
    ('310', 'rutgers-310-education-social-and-philosoph-found-of-ed'),
    ('340', 'rutgers-340-endocrinology-and-animal-biosciences'),
    ('356', 'rutgers-356-english-as-a-second-language'),
    ('360', 'rutgers-360-european-studies'),
    ('364', 'rutgers-364-educational-opportunity-fund'),
    ('375', 'rutgers-375-environmental-sciences'),
    ('378', 'rutgers-378-environmental-change-human-dimension'),
    ('381', 'rutgers-381-environmental-studies'),
    ('382', 'rutgers-382-entrepreneurship'),
    ('440', 'rutgers-440-general-engineering'),
    ('489', 'rutgers-489-greek-modern'),
    ('490', 'rutgers-490-greek'),
    ('505', 'rutgers-505-hindi'),
    ('535', 'rutgers-535-hungarian'),
    ('553', 'rutgers-553-international-business'),
    ('554', 'rutgers-554-interdisciplinary-studies'),
    ('556', 'rutgers-556-interdisciplinary-studies-arts-and-sciences'),
    ('557', 'rutgers-557-interdisciplinary-mason-gross'),
    ('558', 'rutgers-558-international-studies'),
    ('563', 'rutgers-563-jewish-studies'),
    ('565', 'rutgers-565-japanese'),
    ('574', 'rutgers-574-korean'),
    ('580', 'rutgers-580-latin'),
    ('607', 'rutgers-607-leadership-skills'),
    ('617', 'rutgers-617-languages-and-cultures'),
    ('624', 'rutgers-624-management-and-work'),
    ('660', 'rutgers-660-medical-technology'),
    ('667', 'rutgers-667-medieval-studies'),
    ('670', 'rutgers-670-meteorology'),
    ('685', 'rutgers-685-middle-eastern-and-islamic-studies'),
    ('690', 'rutgers-690-military-education-air-force'),
    ('691', 'rutgers-691-military-education-army'),
    ('692', 'rutgers-692-military-education-navy'),
    ('705', 'nursing'),
    ('710', 'rutgers-710-neuroscience'),
    ('723', 'rutgers-723-persian'),
    ('731', 'rutgers-731-packaging-engineering'),
    ('745', 'rutgers-745-physician-assistant'),
    ('787', 'rutgers-787-polish'),
    ('810', 'rutgers-810-portuguese'),
    ('829', 'rutgers-829-organizational-behavior'),
    ('843', 'rutgers-843-public-administration-and-management'),
    ('888', 'rutgers-888-sexualities-studies'),
    ('902', 'rutgers-902-sebs-internship'),
    ('904', 'rutgers-904-social-justice'),
    ('907', 'rutgers-907-academic-and-student-development'),
    ('959', 'rutgers-959-study-abroad'),
    ('963', 'rutgers-963-toxicology'),
    ('973', 'rutgers-973-turkish'),
    ('991', 'rutgers-991-world-languages')
)
INSERT INTO course_departments (course_id, department_id, is_primary)
SELECT DISTINCT c.id, d.id, true
FROM courses c
JOIN mapping m
  ON COALESCE(c.subject_code, split_part(c.course_number, ':', 2)) = m.subject_code
JOIN departments d ON d.slug = m.dept_slug
WHERE NOT EXISTS (
  SELECT 1
  FROM course_departments existing
  WHERE existing.course_id = c.id
)
ON CONFLICT (course_id, department_id) DO NOTHING;

WITH mapping(subject_code, dept_slug) AS (
  VALUES
    ('013', 'rutgers-013-african-middle-eastern-and-south-asian-languages-and-literatures'),
    ('015', 'rutgers-015-environmental-and-biological-sciences'),
    ('019', 'rutgers-019-rutgers-subject-019'),
    ('020', 'rutgers-020-agriculture-and-food-systems'),
    ('035', 'rutgers-035-agricultural-and-natural-resource-management'),
    ('047', 'rutgers-047-alcohol-studies'),
    ('074', 'rutgers-074-arabic-languages'),
    ('078', 'rutgers-078-armenian'),
    ('090', 'rutgers-090-arts-and-sciences'),
    ('107', 'rutgers-107-atmospheric-science'),
    ('117', 'rutgers-117-bioenvironmental-engineering'),
    ('126', 'rutgers-126-biotechnology'),
    ('135', 'rutgers-135-business-administration'),
    ('137', 'rutgers-137-business-and-science'),
    ('140', 'rutgers-140-business-law'),
    ('165', 'rutgers-165-chinese'),
    ('175', 'rutgers-175-cinema-studies'),
    ('186', 'rutgers-186-college-teaching'),
    ('187', 'rutgers-187-college-and-university-leadership'),
    ('190', 'rutgers-190-classics'),
    ('193', 'rutgers-193-community-health-outreach'),
    ('195', 'rutgers-195-comparative-literature'),
    ('207', 'rutgers-207-dance-education'),
    ('217', 'rutgers-217-east-asian-languages-and-cultures'),
    ('255', 'education'),
    ('310', 'rutgers-310-education-social-and-philosoph-found-of-ed'),
    ('340', 'rutgers-340-endocrinology-and-animal-biosciences'),
    ('356', 'rutgers-356-english-as-a-second-language'),
    ('360', 'rutgers-360-european-studies'),
    ('364', 'rutgers-364-educational-opportunity-fund'),
    ('375', 'rutgers-375-environmental-sciences'),
    ('378', 'rutgers-378-environmental-change-human-dimension'),
    ('381', 'rutgers-381-environmental-studies'),
    ('382', 'rutgers-382-entrepreneurship'),
    ('440', 'rutgers-440-general-engineering'),
    ('489', 'rutgers-489-greek-modern'),
    ('490', 'rutgers-490-greek'),
    ('505', 'rutgers-505-hindi'),
    ('535', 'rutgers-535-hungarian'),
    ('553', 'rutgers-553-international-business'),
    ('554', 'rutgers-554-interdisciplinary-studies'),
    ('556', 'rutgers-556-interdisciplinary-studies-arts-and-sciences'),
    ('557', 'rutgers-557-interdisciplinary-mason-gross'),
    ('558', 'rutgers-558-international-studies'),
    ('563', 'rutgers-563-jewish-studies'),
    ('565', 'rutgers-565-japanese'),
    ('574', 'rutgers-574-korean'),
    ('580', 'rutgers-580-latin'),
    ('607', 'rutgers-607-leadership-skills'),
    ('617', 'rutgers-617-languages-and-cultures'),
    ('624', 'rutgers-624-management-and-work'),
    ('660', 'rutgers-660-medical-technology'),
    ('667', 'rutgers-667-medieval-studies'),
    ('670', 'rutgers-670-meteorology'),
    ('685', 'rutgers-685-middle-eastern-and-islamic-studies'),
    ('690', 'rutgers-690-military-education-air-force'),
    ('691', 'rutgers-691-military-education-army'),
    ('692', 'rutgers-692-military-education-navy'),
    ('705', 'nursing'),
    ('710', 'rutgers-710-neuroscience'),
    ('723', 'rutgers-723-persian'),
    ('731', 'rutgers-731-packaging-engineering'),
    ('745', 'rutgers-745-physician-assistant'),
    ('787', 'rutgers-787-polish'),
    ('810', 'rutgers-810-portuguese'),
    ('829', 'rutgers-829-organizational-behavior'),
    ('843', 'rutgers-843-public-administration-and-management'),
    ('888', 'rutgers-888-sexualities-studies'),
    ('902', 'rutgers-902-sebs-internship'),
    ('904', 'rutgers-904-social-justice'),
    ('907', 'rutgers-907-academic-and-student-development'),
    ('959', 'rutgers-959-study-abroad'),
    ('963', 'rutgers-963-toxicology'),
    ('973', 'rutgers-973-turkish'),
    ('991', 'rutgers-991-world-languages')
)
INSERT INTO professor_departments (professor_id, department_id, is_primary)
SELECT DISTINCT ta.professor_id, d.id, false

FROM courses c
JOIN mapping m
  ON COALESCE(c.subject_code, split_part(c.course_number, ':', 2)) = m.subject_code
JOIN departments d ON d.slug = m.dept_slug
JOIN course_departments cd
  ON cd.course_id = c.id
 AND cd.department_id = d.id
JOIN teaching_assignments ta ON ta.course_id = c.id
WHERE ta.professor_id IS NOT NULL
ON CONFLICT (professor_id, department_id) DO NOTHING;
