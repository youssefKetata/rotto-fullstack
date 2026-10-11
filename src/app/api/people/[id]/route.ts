import { ApiError, json, withRecruiter } from "@/lib/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRecruiter(request, async ({ supabase }) => {
    const { id } = await params;
    if (!/^cand_\d{4}$/.test(id))
      throw new ApiError(404, "NOT_FOUND", "This candidate was not found.");
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
    return json(data);
  });
}
