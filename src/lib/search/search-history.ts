import "server-only";
import { ApiError, type RecruiterContext } from "@/lib/api";

type Client = RecruiterContext["supabase"];

export async function listSearchHistory(supabase: Client) {
  const { data, error } = await supabase
    .from("searches")
    .select("id,brief,filters,total,status,created_at")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Search history unavailable");
  return data ?? [];
}

export async function readCompletedSearch(supabase: Client, id: string) {
  const { data, error } = await supabase
    .from("searches")
    .select("brief,status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Search read failed");
  if (!data || data.status !== "completed")
    throw new ApiError(404, "NOT_FOUND", "This search was not found.");
  return data;
}
