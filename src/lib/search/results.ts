import "server-only";

import { getDatabase } from "@/lib/database";
import type { Json } from "@/lib/supabase/types";
import { SEARCH_PAGE_SIZE } from "./contracts";
import type { Candidate } from "./types";

type SearchPage = {
  id: string;
  brief: string;
  filters: Json;
  total: number;
  status: string;
  searches_remaining: number | null;
  results: Candidate[];
};

// The pool bypasses RLS. Resolve ownership from the verified recruiter in the
// same statement that reads the search, before joining any result rows.
export async function readSearchPage(
  recruiterId: string,
  id: string,
  page: number,
) {
  const first = (page - 1) * SEARCH_PAGE_SIZE + 1;
  const [result] = await getDatabase()<SearchPage[]>`
    select search.id, search.brief, search.filters, search.total, search.status,
      case when exists (
        select 1 from private.subscriptions subscription
        where subscription.company_id = recruiter.company_id and subscription.status = 'active'
      ) then null when usage.free_searches_used = 1 or (
        usage.reserved_search_id is not null and usage.reservation_expires_at > statement_timestamp()
      ) then 0 else 1 end as searches_remaining,
      coalesce(results.people, '[]'::jsonb) as results
    from public.recruiters recruiter
    join public.searches search on search.company_id = recruiter.company_id and search.id = ${id}
    left join private.company_usage usage on usage.company_id = recruiter.company_id
    left join lateral (
      select jsonb_agg(to_jsonb(person) || jsonb_build_object(
        'experiences', coalesce(jobs.history, '[]'::jsonb),
        'education', coalesce(schools.history, '[]'::jsonb)
      ) order by result.position) as people
      from public.search_results result
      join public.candidates person on person.id = result.candidate_id
      left join lateral (
        select jsonb_agg(to_jsonb(job) order by job.position) as history
        from public.candidate_experiences job where job.candidate_id = person.id
      ) jobs on true
      left join lateral (
        select jsonb_agg(to_jsonb(school) order by school.position) as history
        from public.candidate_education school where school.candidate_id = person.id
      ) schools on true
      where search.status = 'completed' and result.search_id = search.id
        and result.position between ${first} and ${first + SEARCH_PAGE_SIZE - 1}
    ) results on true
    where recruiter.id = ${recruiterId}`;
  return result;
}
