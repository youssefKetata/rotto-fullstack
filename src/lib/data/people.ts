import "server-only";
import { DataNotFoundError } from "./errors";
import type { UserDataClient } from "./client";

export async function readCandidate(supabase: UserDataClient, id: string) {
  const { data, error } = await supabase
    .from("candidates")
    .select(
      "*,experiences:candidate_experiences(*),education:candidate_education(*)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Candidate read failed");
  if (!data) throw new DataNotFoundError("This candidate was not found.");
  return data;
}
