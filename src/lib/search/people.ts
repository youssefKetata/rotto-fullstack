import "server-only";
import { ApiError, type RecruiterContext } from "@/lib/api";

type Client = RecruiterContext["supabase"];

export async function readCandidate(supabase: Client, id: string) {
  const { data, error } = await supabase
    .from("candidates")
    .select(
      "*,experiences:candidate_experiences(*),education:candidate_education(*)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Candidate read failed");
  if (!data)
    throw new ApiError(404, "NOT_FOUND", "This candidate was not found.");
  return data;
}
