INSERT INTO public.professor_departments (professor_id, department_id, is_primary)
SELECT DISTINCT ta.professor_id, cd.department_id, false
FROM public.teaching_assignments ta
JOIN public.course_departments cd ON cd.course_id = ta.course_id
LEFT JOIN public.professor_departments pd
  ON pd.professor_id = ta.professor_id
 AND pd.department_id = cd.department_id
WHERE ta.professor_id IS NOT NULL
  AND pd.professor_id IS NULL
ON CONFLICT (professor_id, department_id) DO NOTHING;
