insert into public.companies (id, slug, name) values
  ('20000000-0000-0000-0000-000000000001', 'acme', 'Acme'),
  ('20000000-0000-0000-0000-000000000002', 'globex', 'Globex')
on conflict (slug) do update set name = excluded.name;

insert into private.company_usage (company_id)
select id from public.companies where slug in ('acme', 'globex')
on conflict (company_id) do nothing;
