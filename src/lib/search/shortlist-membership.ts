import "server-only";

import { ApiError } from "@/lib/api";
import { getDatabase } from "@/lib/database";

/** Membership and company ownership are checked in the same transaction. */
export async function mutateShortlistMembership(
  recruiterId: string,
  listId: string,
  personId: string,
  add: boolean,
  restoreAddedAt?: string,
) {
  return getDatabase().begin(async (sql) => {
    const [list] = await sql`
      select list.id from public.shortlists as list
      join public.recruiters as recruiter on recruiter.company_id = list.company_id
      where list.id = ${listId} and recruiter.id = ${recruiterId}
      for share of list, recruiter`;
    if (!list)
      throw new ApiError(404, "NOT_FOUND", "This shortlist was not found.");
    if (add) {
      const [person] =
        await sql`select id from public.candidates where id = ${personId}`;
      if (!person)
        throw new ApiError(404, "NOT_FOUND", "This candidate was not found.");
      await sql`
        insert into public.shortlist_people (shortlist_id, candidate_id, added_by, added_at)
        values (${listId}, ${personId}, ${recruiterId}, coalesce(${restoreAddedAt ?? null}::text::timestamptz, now()))
        on conflict (shortlist_id, candidate_id) do nothing`;
      return { ok: true };
    }
    const [removed] = await sql<{ added_at: string }[]>`
      delete from public.shortlist_people
      where shortlist_id = ${listId} and candidate_id = ${personId}
      returning to_char(added_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as added_at`;
    return { ok: true, membership: removed ?? null };
  });
}
