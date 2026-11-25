create table private.checkout_reservations (
  company_id uuid primary key references public.companies(id) on delete cascade,
  attempt_id uuid not null unique,
  expires_at timestamptz not null
);

alter table private.checkout_reservations enable row level security;
revoke all on private.checkout_reservations from public, anon, authenticated;
grant select, insert, update on private.checkout_reservations to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'rotto_server') then
    grant select, insert, update on private.checkout_reservations to rotto_server;
  end if;
end;
$$;
