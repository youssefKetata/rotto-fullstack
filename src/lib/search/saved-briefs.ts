import "server-only";
import { getDatabase } from "@/lib/database";
import type { SavedBrief } from "./contracts";

/** Only completed results for this company's exact saved brief and filters qualify. */
export async function savedBriefsForRecruiter(
  recruiterId: string,
): Promise<SavedBrief[]> {
  return getDatabase()<SavedBrief[]>`
    select saved.id, saved.name, saved.brief, saved.filters,
      saved.created_at::text,
      latest.id as last_search_id, latest.total as last_result_count,
      latest.completed_at::text as last_searched_at
    from public.recruiters recruiter
    join public.saved_briefs saved on saved.company_id = recruiter.company_id
    left join lateral (
      select search.id, search.total, search.completed_at
      from public.searches search
      where search.company_id = saved.company_id and search.status = 'completed'
        and btrim(search.brief) = saved.brief and search.filters = saved.filters
      order by search.completed_at desc, search.id desc limit 1
    ) latest on true
    where recruiter.id = ${recruiterId}
    order by saved.created_at desc, saved.id`;
}
