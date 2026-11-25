import "server-only";

import { getDatabase } from "@/lib/database";
import type { Json } from "@/lib/supabase/types";
import { SEARCH_PAGE_SIZE } from "./contracts";
import type { Candidate, CandidateSummary } from "./types";

type SearchPage<Person> = {
  id: string;
  brief: string;
  filters: Json;
  total: number;
  status: string;
  searches_remaining: number | null;
  results: Person[];
};
type SearchRows = Pick<
  SearchPage<CandidateSummary>,
  "id" | "status" | "total" | "results"
>;

// The pool bypasses RLS. Resolve ownership from the verified recruiter in the
// same statement that reads the search, before joining any result rows.
export function readSearchPage(
  recruiterId: string,
  id: string,
  page: number,
  view: "full",
): Promise<SearchPage<Candidate> | undefined>;
export function readSearchPage(
  recruiterId: string,
  id: string,
  page: number,
  view: "rows",
): Promise<SearchRows | undefined>;
export async function readSearchPage(
  recruiterId: string,
  id: string,
  page: number,
  view: "full" | "rows",
): Promise<SearchRows | undefined> {
  const first = (page - 1) * SEARCH_PAGE_SIZE + 1;
  const sql = getDatabase();
  const jobFields =
    view === "rows"
      ? sql`jsonb_build_object('position', job.position, 'title', job.title,
      'company_name', job.company_name, 'company_type', job.company_type, 'end_year', job.end_year)`
      : sql`to_jsonb(job)`;
  const education =
    view === "full"
      ? sql`|| jsonb_build_object('education', coalesce((
      select jsonb_agg(to_jsonb(school) order by school.position)
      from public.candidate_education school where school.candidate_id = person.id
    ), '[]'::jsonb))`
      : sql``;
  const metadata =
    view === "full"
      ? sql`search.brief, search.filters,
        case when exists (
          select 1 from private.subscriptions subscription
          where subscription.company_id = recruiter.company_id and subscription.status = 'active'
        ) then null when usage.free_searches_used = 1 or (
          usage.reserved_search_id is not null and usage.reservation_expires_at > statement_timestamp()
        ) then 0 else 1 end as searches_remaining,`
      : sql``;
  const usageJoin =
    view === "full"
      ? sql`left join private.company_usage usage on usage.company_id = recruiter.company_id`
      : sql``;
  const [result] = await sql<SearchRows[]>`
    select search.id, search.total, search.status, ${metadata}
      coalesce(results.people, '[]'::jsonb) as results
    from public.recruiters recruiter
    join public.searches search on search.company_id = recruiter.company_id and search.id = ${id}
    ${usageJoin}
    left join lateral (
      select jsonb_agg(to_jsonb(person) || jsonb_build_object(
        'experiences', coalesce((
          select jsonb_agg(${jobFields} order by job.position)
          from public.candidate_experiences job where job.candidate_id = person.id
        ), '[]'::jsonb)
      ) ${education} order by result.position) as people
      from (
        select position, candidate_id from public.search_results
        where search.status = 'completed' and search_id = search.id
          and position between ${first} and ${first + SEARCH_PAGE_SIZE - 1}
        order by position
        limit ${SEARCH_PAGE_SIZE}
      ) result
      join public.candidates person on person.id = result.candidate_id
    ) results on true
    where recruiter.id = ${recruiterId}`;
  return result;
}
