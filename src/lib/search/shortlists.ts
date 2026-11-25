import "server-only";
import { ApiError, type RecruiterContext } from "@/lib/api";
import type { ShortlistMembership } from "./contracts";

type Client = RecruiterContext["supabase"];

export async function listShortlists(supabase: Client) {
  const { data, error } = await supabase
    .from("shortlists")
    .select("id,name,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Shortlists read failed");
  return data ?? [];
}

export async function createShortlist(supabase: Client, name: string) {
  const { data, error } = await supabase
    .from("shortlists")
    .insert({ name })
    .select("id")
    .single();
  if (error) throw new Error("Shortlist creation failed");
  return data;
}

export async function readShortlist(supabase: Client, id: string) {
  const { data, error } = await supabase
    .from("shortlists")
    .select("id,name,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Shortlist read failed");
  if (!data)
    throw new ApiError(404, "NOT_FOUND", "This shortlist was not found.");
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
  supabase: Client,
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
  if (!data)
    throw new ApiError(404, "NOT_FOUND", "This shortlist was not found.");
  return data;
}

export async function deleteShortlist(supabase: Client, id: string) {
  const { data, error } = await supabase
    .from("shortlists")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Shortlist deletion failed");
  if (!data)
    throw new ApiError(404, "NOT_FOUND", "This shortlist was not found.");
  return { ok: true };
}
