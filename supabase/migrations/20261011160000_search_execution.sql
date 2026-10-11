-- Schema only. Search admission, completion and matching live in Next.js services.
create table private.search_executions (
  search_id uuid primary key,
  company_id uuid not null,
  request_key text check (length(request_key) between 1 and 128),
  request_hash text not null check (length(request_hash) between 1 and 128),
  attempt_id uuid not null,
  lease_expires_at timestamptz not null,
  admitted_plan text not null check (admitted_plan in ('free', 'paid')),
  failure_reason text,
  foreign key (search_id, company_id) references public.searches(id, company_id) on delete cascade,
  unique (company_id, request_key)
);
alter table private.search_executions enable row level security;
revoke all on private.search_executions from public, anon, authenticated;
grant all on private.search_executions to service_role;
create index subscriptions_active_company_idx on private.subscriptions(company_id)
  where status = 'active';
