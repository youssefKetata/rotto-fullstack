import "server-only";
import { DataNotFoundError } from "./errors";
import type { UserDataClient } from "./client";

export async function listSearchHistory(supabase: UserDataClient) {
  const { data, error } = await supabase
    .from("searches")
    .select("id,brief,filters,total,status,created_at")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Search history unavailable");
  return data ?? [];
}

export async function readCompletedSearch(
  supabase: UserDataClient,
  id: string,
) {
  const { data, error } = await supabase
    .from("searches")
    .select("brief,status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Search read failed");
  if (!data || data.status !== "completed")
    throw new DataNotFoundError("This search was not found.");
  return data;
}
