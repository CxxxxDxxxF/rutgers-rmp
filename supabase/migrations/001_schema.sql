create table professor_cache (
  id uuid primary key default gen_random_uuid(),
  rmp_id text unique not null,
  slug text unique not null,
  first_name text,
  last_name text,
  department text,
  school_name text,
  avg_rating numeric,
  avg_difficulty numeric,
  would_take_again numeric,
  num_ratings integer,
  ratings jsonb,
  ai_analysis jsonb,
  cached_at timestamptz default now(),
  search_count integer default 1
);

create index on professor_cache (slug);
create index on professor_cache (search_count desc);
create index on professor_cache (cached_at desc);
