create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to authenticated, service_role;


-- lock down future tables
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9_-]{0,63}$'),
  name text not null check (length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.recruiters (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  created_at timestamptz not null default now(),
  unique (id, company_id)
);

-- Resolves JWT membership without recursive recruiter policies.
create function private.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select recruiter.company_id
  from public.recruiters as recruiter
  where recruiter.id = (select auth.uid());
$$;
revoke all on function private.current_company_id() from public, anon, authenticated;
grant execute on function private.current_company_id() to authenticated, service_role;

create table public.candidates (
  id text primary key check (length(btrim(id)) > 0),
  full_name text not null check (length(btrim(full_name)) > 0),
  headline text not null,
  avatar_url text not null,
  current_title text not null,
  current_company text not null,
  current_company_logo_url text not null,
  role text not null check (length(btrim(role)) > 0),
  seniority text not null check (seniority in ('junior', 'mid', 'senior', 'staff')),
  years_experience integer not null check (years_experience >= 0),
  city text not null,
  state text not null,
  country text not null,
  open_to_work boolean not null,
  skills text[] not null default '{}',
  check (array_position(skills, null) is null)
);
create index candidates_role_seniority_idx on public.candidates(lower(role), seniority);
create index candidates_location_idx on public.candidates(lower(city), lower(state), lower(country));
create index candidates_skills_idx on public.candidates using gin(skills);

create table public.candidate_experiences (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null references public.candidates(id) on delete cascade,
  position integer not null check (position >= 0),
  title text not null,
  company_name text not null,
  company_logo_url text not null,
  company_type text not null check (company_type in ('startup', 'enterprise')),
  start_year integer not null check (start_year > 0),
  end_year integer,
  description text not null,
  unique (candidate_id, position),
  check (end_year is null or end_year >= start_year)
);

create table public.candidate_education (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null references public.candidates(id) on delete cascade,
  position integer not null check (position >= 0),
  school text not null,
  degree text not null,
  field text not null,
  graduation_year integer check (graduation_year > 0),
  unique (candidate_id, position)
);

create table public.shortlists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default private.current_company_id() references public.companies(id),
  name text not null check (length(btrim(name)) between 1 and 100),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (created_by, company_id) references public.recruiters(id, company_id)
);

create table public.shortlist_people (
  shortlist_id uuid not null references public.shortlists(id) on delete cascade,
  candidate_id text not null references public.candidates(id),
  added_by uuid not null default auth.uid() references public.recruiters(id),
  added_at timestamptz not null default now(),
  primary key (shortlist_id, candidate_id)
);

create table public.saved_briefs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default private.current_company_id() references public.companies(id),
  brief text not null check (length(btrim(brief)) between 1 and 4000),
  filters jsonb not null check (jsonb_typeof(filters) = 'object'),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (created_by, company_id) references public.recruiters(id, company_id)
);

create table public.searches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  brief text not null check (length(btrim(brief)) between 1 and 4000),
  filters jsonb not null default '{}' check (jsonb_typeof(filters) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  total integer not null default 0 check (total >= 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, company_id),
  foreign key (created_by, company_id) references public.recruiters(id, company_id),
  check (
    (status = 'pending' and completed_at is null)
    or (status in ('completed', 'failed') and completed_at is not null)
  )
);

create table public.search_results (
  search_id uuid not null references public.searches(id) on delete cascade,
  candidate_id text not null references public.candidates(id),
  position integer not null check (position >= 1),
  primary key (search_id, candidate_id),
  unique (search_id, position)
);

create table private.company_usage (
  company_id uuid primary key references public.companies(id),
  free_searches_used integer not null default 0 check (free_searches_used between 0 and 1),
  reserved_search_id uuid,
  reservation_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (reserved_search_id, company_id) references public.searches(id, company_id),
  check (
    (reserved_search_id is null and reservation_expires_at is null)
    or (reserved_search_id is not null and reservation_expires_at is not null and free_searches_used = 0)
  )
);

create table private.billing_events (
  event_id text primary key check (length(btrim(event_id)) > 0),
  event_type text not null,
  event_created bigint not null check (event_created >= 0),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text not null default 'pending' check (outcome in ('pending', 'applied', 'ignored')),
  check (
    (outcome = 'pending' and processed_at is null)
    or (outcome in ('applied', 'ignored') and processed_at is not null)
  )
);

create table private.subscriptions (
  stripe_subscription_id text primary key check (length(btrim(stripe_subscription_id)) > 0),
  company_id uuid not null references public.companies(id),
  status text not null check (length(btrim(status)) > 0),
  last_event_created bigint not null check (last_event_created >= 0),
  last_event_id text not null references private.billing_events(event_id),
  updated_at timestamptz not null default now()
);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;
grant execute on function private.set_updated_at() to service_role;

create trigger shortlists_updated_at before update on public.shortlists
  for each row execute function private.set_updated_at();
create trigger company_usage_updated_at before update on private.company_usage
  for each row execute function private.set_updated_at();
create trigger subscriptions_updated_at before update on private.subscriptions
  for each row execute function private.set_updated_at();

revoke all on table public.companies, public.recruiters, public.candidates,
  public.candidate_experiences, public.candidate_education, public.shortlists,
  public.shortlist_people, public.saved_briefs, public.searches, public.search_results
  from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

grant all on table public.companies, public.recruiters, public.candidates,
  public.candidate_experiences, public.candidate_education, public.shortlists,
  public.shortlist_people, public.saved_briefs, public.searches, public.search_results
  to service_role;
grant all on all tables in schema private to service_role;

grant select on table public.companies, public.recruiters, public.candidates,
  public.candidate_experiences, public.candidate_education, public.shortlists,
  public.shortlist_people, public.saved_briefs, public.searches, public.search_results
  to authenticated;
grant insert (name), update (name) on public.shortlists to authenticated;
grant delete on public.shortlists to authenticated;
grant insert (shortlist_id, candidate_id) on public.shortlist_people to authenticated;
grant delete on public.shortlist_people to authenticated;
grant insert (brief, filters) on public.saved_briefs to authenticated;
grant delete on public.saved_briefs to authenticated;

alter table public.companies enable row level security;
alter table public.recruiters enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_experiences enable row level security;
alter table public.candidate_education enable row level security;
alter table public.shortlists enable row level security;
alter table public.shortlist_people enable row level security;
alter table public.saved_briefs enable row level security;
alter table public.searches enable row level security;
alter table public.search_results enable row level security;
-- No client policies: accidental grants still cannot expose private rows.
alter table private.company_usage enable row level security;
alter table private.billing_events enable row level security;
alter table private.subscriptions enable row level security;

create policy companies_read on public.companies for select to authenticated
  using (id = (select private.current_company_id()));
create policy recruiters_read on public.recruiters for select to authenticated
  using (id = (select auth.uid()));

create policy candidates_read on public.candidates for select to authenticated
  using ((select private.current_company_id()) is not null);
create policy candidate_experiences_read on public.candidate_experiences for select to authenticated
  using ((select private.current_company_id()) is not null);
create policy candidate_education_read on public.candidate_education for select to authenticated
  using ((select private.current_company_id()) is not null);

create policy shortlists_read on public.shortlists for select to authenticated
  using (company_id = (select private.current_company_id()));
create policy shortlists_create on public.shortlists for insert to authenticated
  with check (
    company_id = (select private.current_company_id()) and created_by = (select auth.uid())
  );
create policy shortlists_rename on public.shortlists for update to authenticated
  using (company_id = (select private.current_company_id()))
  with check (company_id = (select private.current_company_id()));
create policy shortlists_delete on public.shortlists for delete to authenticated
  using (company_id = (select private.current_company_id()));

create policy shortlist_people_read on public.shortlist_people for select to authenticated
  using (exists (
    select 1 from public.shortlists as list
    where list.id = shortlist_id and list.company_id = (select private.current_company_id())
  ));
create policy shortlist_people_add on public.shortlist_people for insert to authenticated
  with check (
    added_by = (select auth.uid()) and exists (
      select 1 from public.shortlists as list
      where list.id = shortlist_id and list.company_id = (select private.current_company_id())
    )
  );
create policy shortlist_people_remove on public.shortlist_people for delete to authenticated
  using (exists (
    select 1 from public.shortlists as list
    where list.id = shortlist_id and list.company_id = (select private.current_company_id())
  ));

create policy saved_briefs_read on public.saved_briefs for select to authenticated
  using (company_id = (select private.current_company_id()));
create policy saved_briefs_create on public.saved_briefs for insert to authenticated
  with check (
    company_id = (select private.current_company_id()) and created_by = (select auth.uid())
  );
create policy saved_briefs_delete on public.saved_briefs for delete to authenticated
  using (company_id = (select private.current_company_id()));

-- Server-only writes prevent bypassing the search quota.
create policy searches_read on public.searches for select to authenticated
  using (company_id = (select private.current_company_id()));
create policy search_results_read on public.search_results for select to authenticated
  using (exists (
    select 1 from public.searches as search
    where search.id = search_id
      and search.company_id = (select private.current_company_id())
      and search.status = 'completed'
  ));

