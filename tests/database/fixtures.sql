insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'recruiter@acme.test'),
  ('10000000-0000-0000-0000-000000000002', 'recruiter@globex.test'),
  ('10000000-0000-0000-0000-000000000003', 'unassigned@test.invalid');

insert into public.companies (id, slug, name) values
  ('20000000-0000-0000-0000-000000000001', 'acme', 'Acme'),
  ('20000000-0000-0000-0000-000000000002', 'globex', 'Globex');
insert into public.recruiters (id, company_id) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002');

insert into public.candidates (
  id, full_name, headline, avatar_url, current_title, current_company,
  current_company_logo_url, role, seniority, years_experience,
  city, state, country, open_to_work, skills
) values
  ('cand_test_a', 'Test A', 'Frontend Engineer', '/a.svg', 'Frontend Engineer',
   'Startup A', '/company-a.svg', 'Frontend Engineer', 'senior', 8,
   'New York', 'NY', 'US', true, array['React', 'TypeScript']),
  ('cand_test_b', 'Test B', 'Backend Engineer', '/b.svg', 'Backend Engineer',
   'Enterprise B', '/company-b.svg', 'Backend Engineer', 'mid', 4,
   'Austin', 'TX', 'US', false, array['Go', 'Kubernetes']);

insert into public.candidate_experiences (
  candidate_id, position, title, company_name, company_logo_url,
  company_type, start_year, end_year, description
) values
  ('cand_test_a', 0, 'Frontend Engineer', 'Startup A', '/company-a.svg', 'startup', 2020, null, 'React'),
  ('cand_test_b', 0, 'Backend Engineer', 'Enterprise B', '/company-b.svg', 'enterprise', 2022, null, 'Go');
insert into public.candidate_education (candidate_id, position, school, degree, field, graduation_year) values
  ('cand_test_a', 0, 'School A', 'BS', 'Computer Science', 2018),
  ('cand_test_b', 0, 'School B', 'MS', 'Computer Science', 2022);

insert into public.shortlists (id, company_id, name, created_by, updated_at) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'Acme list', '10000000-0000-0000-0000-000000000001', '2020-01-01'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002',
   'Globex list', '10000000-0000-0000-0000-000000000002', '2020-01-01');
insert into public.shortlist_people (shortlist_id, candidate_id, added_by) values
  ('30000000-0000-0000-0000-000000000001', 'cand_test_a', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', 'cand_test_b', '10000000-0000-0000-0000-000000000002');

insert into public.saved_briefs (id, company_id, brief, filters, created_by) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'React engineers', '{"skills":["React"]}', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002',
   'Go engineers', '{"skills":["Go"]}', '10000000-0000-0000-0000-000000000002');

insert into public.searches (id, company_id, brief, filters, status, total, created_by, completed_at) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'React engineers', '{"skills":["React"]}', 'completed', 1, '10000000-0000-0000-0000-000000000001', now()),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002',
   'Go engineers', '{"skills":["Go"]}', 'completed', 1, '10000000-0000-0000-0000-000000000002', now());
insert into public.search_results (search_id, candidate_id, position) values
  ('50000000-0000-0000-0000-000000000001', 'cand_test_a', 1),
  ('50000000-0000-0000-0000-000000000002', 'cand_test_b', 1);

insert into private.company_usage (company_id) select id from public.companies;
insert into private.billing_events (event_id, event_type, event_created, processed_at, outcome) values
  ('evt_test_acme', 'customer.subscription.created', 100, now(), 'applied'),
  ('evt_test_globex', 'customer.subscription.created', 100, now(), 'applied');
insert into private.subscriptions (stripe_subscription_id, company_id, status, last_event_created, last_event_id) values
  ('sub_test_acme', '20000000-0000-0000-0000-000000000001', 'active', 100, 'evt_test_acme'),
  ('sub_test_globex', '20000000-0000-0000-0000-000000000002', 'active', 100, 'evt_test_globex');
