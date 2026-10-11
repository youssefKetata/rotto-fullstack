import { authResponse } from "@/lib/auth-response";
import { getRecruiter } from "@/lib/supabase/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await getRecruiter();
    if (!context)
      return authResponse({ error: "Recruiter access required." }, 401);
    const { id } = await params;
    if (!/^cand_\d{4}$/.test(id))
      return authResponse({ error: "Candidate not found." }, 404);
    const { data, error } = await context.supabase
      .from("candidates")
      .select(
        "*,experiences:candidate_experiences(*),education:candidate_education(*)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("Query failed");
    if (!data) return authResponse({ error: "Candidate not found." }, 404);
    return authResponse(data);
  } catch {
    return authResponse(
      { error: "Couldn't open this candidate. Please try again." },
      500,
    );
  }
}
