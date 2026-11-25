import "server-only";
import { DataNotFoundError } from "./errors";
import type { UserDataClient } from "./client";
import { getDatabase } from "./pool";
import type {
  Shortlist,
  ShortlistMembership,
  ShortlistWithMember,
} from "@/lib/search/contracts";

export async function listShortlists(supabase: UserDataClient) {
  const { data, error } = await supabase
    .from("shortlists")
    .select("id,name,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Shortlists read failed");
  return data ?? [];
}

export async function createShortlist(supabase: UserDataClient, name: string) {
  const { data, error } = await supabase
    .from("shortlists")
    .insert({ name })
    .select("id")
    .single();
  if (error) throw new Error("Shortlist creation failed");
  return data;
}

export async function createShortlistWithMember(
  recruiterId: string,
  listId: string,
  name: string,
  candidateId: string,
): Promise<ShortlistWithMember> {
  type SavedList = Shortlist & ShortlistMembership;
  return getDatabase().begin(async (sql) => {
    const [created] = await sql<SavedList[]>`
      with new_list as (
        insert into public.shortlists (id, company_id, created_by, name)
        select ${listId}, recruiter.company_id, recruiter.id, ${name}
        from public.recruiters recruiter
        join public.candidates candidate on candidate.id = ${candidateId}
        where recruiter.id = ${recruiterId}
        on conflict (id) do nothing
        returning id, name, created_at, updated_at, created_by
      ), new_member as (
        insert into public.shortlist_people (shortlist_id, candidate_id, added_by)
        select id, ${candidateId}, created_by from new_list
        returning shortlist_id, candidate_id, added_at, added_by
      )
      select list.id, list.name, list.created_at, list.updated_at,
             member.candidate_id, member.added_at, member.added_by
      from new_list list join new_member member on member.shortlist_id = list.id`;

    // A retry can arrive after the first request committed but its response was lost.
    const [saved] = created
      ? [created]
      : await sql<SavedList[]>`
      select list.id, list.name, list.created_at, list.updated_at,
             member.candidate_id, member.added_at, member.added_by
      from public.shortlists list
      join public.recruiters recruiter on recruiter.company_id = list.company_id
        and recruiter.id = list.created_by
      join public.shortlist_people member on member.shortlist_id = list.id
        and member.added_by = recruiter.id
      where list.id = ${listId} and recruiter.id = ${recruiterId}
        and member.candidate_id = ${candidateId}`;
    if (!saved)
      throw new DataNotFoundError(
        "Couldn’t save this candidate to a new shortlist.",
      );
    const { candidate_id, added_at, added_by, ...list } = saved;
    return { ...list, membership: { candidate_id, added_at, added_by } };
  });
}

export async function readShortlist(supabase: UserDataClient, id: string) {
  const { data, error } = await supabase
    .from("shortlists")
    .select("id,name,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Shortlist read failed");
  if (!data) throw new DataNotFoundError("This shortlist was not found.");
  const people: object[] = [];
  const memberships: ShortlistMembership[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await supabase
      .from("shortlist_people")
      .select(
        "candidate_id,added_at,added_by,person:candidates(*,experiences:candidate_experiences(*),education:candidate_education(*))",
      )
      .eq("shortlist_id", id)
      .order("candidate_id")
      .range(offset, offset + 999);
    if (page.error) throw new Error("Shortlist people read failed");
    people.push(...(page.data ?? []).map((row) => row.person));
    memberships.push(
      ...(page.data ?? []).map(({ candidate_id, added_at, added_by }) => ({
        candidate_id,
        added_at,
        added_by,
      })),
    );
    if ((page.data?.length ?? 0) < 1000) break;
  }
  return { ...data, people, memberships };
}

export async function renameShortlist(
  supabase: UserDataClient,
  id: string,
  name: string,
) {
  const { data, error } = await supabase
    .from("shortlists")
    .update({ name })
    .eq("id", id)
    .select("id,name")
    .maybeSingle();
  if (error) throw new Error("Shortlist rename failed");
  if (!data) throw new DataNotFoundError("This shortlist was not found.");
  return data;
}

export async function deleteShortlist(supabase: UserDataClient, id: string) {
  const { data, error } = await supabase
    .from("shortlists")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Shortlist deletion failed");
  if (!data) throw new DataNotFoundError("This shortlist was not found.");
  return { ok: true };
}
