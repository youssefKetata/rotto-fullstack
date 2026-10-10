insert into public.candidates (
  id, full_name, headline, avatar_url, current_title, current_company,
  current_company_logo_url, role, seniority, years_experience,
  city, state, country, open_to_work, skills
)
select id, full_name, headline, avatar_url, current_title, current_company,
  current_company_logo_url, role, seniority, years_experience,
  location->>'city', location->>'state', location->>'country', open_to_work, skills
from seed_candidates
on conflict (id) do update set
  full_name = excluded.full_name,
  headline = excluded.headline,
  avatar_url = excluded.avatar_url,
  current_title = excluded.current_title,
  current_company = excluded.current_company,
  current_company_logo_url = excluded.current_company_logo_url,
  role = excluded.role,
  seniority = excluded.seniority,
  years_experience = excluded.years_experience,
  city = excluded.city,
  state = excluded.state,
  country = excluded.country,
  open_to_work = excluded.open_to_work,
  skills = excluded.skills;

insert into public.candidate_experiences (
  candidate_id, position, title, company_name, company_logo_url,
  company_type, start_year, end_year, description
)
select candidate.id, (entry.ordinality - 1)::integer,
  entry.value->>'title', entry.value->>'company', entry.value->>'company_logo_url',
  entry.value->>'company_type', (entry.value->>'start_year')::integer,
  (entry.value->>'end_year')::integer, entry.value->>'description'
from seed_candidates as candidate
cross join lateral jsonb_array_elements(candidate.experiences) with ordinality as entry(value, ordinality)
on conflict (candidate_id, position) do update set
  title = excluded.title,
  company_name = excluded.company_name,
  company_logo_url = excluded.company_logo_url,
  company_type = excluded.company_type,
  start_year = excluded.start_year,
  end_year = excluded.end_year,
  description = excluded.description;

delete from public.candidate_experiences as experience
using seed_candidates as candidate
where experience.candidate_id = candidate.id
  and experience.position >= jsonb_array_length(candidate.experiences);

insert into public.candidate_education (
  candidate_id, position, school, degree, field, graduation_year
)
select candidate.id, (entry.ordinality - 1)::integer,
  entry.value->>'school', entry.value->>'degree', entry.value->>'field',
  (entry.value->>'graduation_year')::integer
from seed_candidates as candidate
cross join lateral jsonb_array_elements(candidate.education) with ordinality as entry(value, ordinality)
on conflict (candidate_id, position) do update set
  school = excluded.school,
  degree = excluded.degree,
  field = excluded.field,
  graduation_year = excluded.graduation_year;

delete from public.candidate_education as education
using seed_candidates as candidate
where education.candidate_id = candidate.id
  and education.position >= jsonb_array_length(candidate.education);
