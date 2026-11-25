import "server-only";
import { getDatabase } from "@/lib/data/pool";
import type { SavedBrief } from "@/lib/search/contracts";
import type { SearchFilters } from "@/lib/search/schema";
import { DataNotFoundError } from "./errors";
import type { UserDataClient, RecruiterMembership } from "./client";

export async function saveBrief(
  {
    supabase,
    recruiter,
  }: { supabase: UserDataClient; recruiter: RecruiterMembership },
  brief: string,
  filters: SearchFilters,
) {
  const inserted = await supabase
    .from("saved_briefs")
    .insert({ brief, filters })
    .select("id")
    .single();
  let id: string;
  const created = !inserted.error;
  if (inserted.error?.code === "23505") {
    const existing = await supabase
      .from("saved_briefs")
      .select("id")
      .eq("company_id", recruiter.company_id)
      .eq("brief", brief)
      .eq("filters", JSON.stringify(filters))
      .single();
    if (existing.error) throw new Error("Saved search read failed");
    id = existing.data.id;
  } else {
    if (inserted.error) throw new Error("Saving search failed");
    id = inserted.data.id;
  }
  const [saved] = await querySavedBriefs(recruiter.id, id);
  if (!saved) throw new Error("Saved search read failed");
  return { saved, created };
}

export async function readSavedBrief(supabase: UserDataClient, id: string) {
  const { data, error } = await supabase
    .from("saved_briefs")
    .select("brief,filters")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Saved search read failed");
  if (!data) throw new DataNotFoundError("This saved search was not found.");
  return data;
}

export async function renameSavedBrief(
  supabase: UserDataClient,
  id: string,
  name: string,
) {
  const { data, error } = await supabase
    .from("saved_briefs")
    .update({ name })
    .eq("id", id)
    .select("id,name")
    .maybeSingle();
  if (error) throw new Error("Saved search rename failed");
  if (!data) throw new DataNotFoundError("This saved search was not found.");
  return data;
}

export async function deleteSavedBrief(supabase: UserDataClient, id: string) {
  const { data, error } = await supabase
    .from("saved_briefs")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Saved search removal failed");
  if (!data) throw new DataNotFoundError("This saved search was not found.");
  return { ok: true };
}

/** Only completed results for this company's exact saved brief and filters qualify. */
export function savedBriefsForRecruiter(recruiterId: string) {
  return querySavedBriefs(recruiterId);
}

async function querySavedBriefs(recruiterId: string, savedId?: string) {
  const sql = getDatabase();
  return sql<SavedBrief[]>`
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
      ${savedId ? sql`and saved.id = ${savedId}` : sql``}
    order by saved.created_at desc, saved.id`;
}
