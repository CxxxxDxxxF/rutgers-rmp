-- Performance advisor: cover foreign keys on hot join paths. The remaining
-- flagged FKs (majors/minors/search_history) back low-traffic features and are
-- intentionally left unindexed until usage justifies them.
create index if not exists professors_cache_id_idx on public.professors (cache_id);
create index if not exists reviews_semester_id_idx on public.reviews (semester_id);
create index if not exists user_submissions_professor_id_idx on public.user_submissions (professor_id);
create index if not exists user_submissions_semester_id_idx on public.user_submissions (semester_id);
create index if not exists course_departments_department_id_idx on public.course_departments (department_id);
