import { readCandidate } from "@/lib/data/people";
import { ApiError, json, withRecruiter } from "@/lib/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRecruiter(request, async ({ supabase }) => {
    const { id } = await params;
    if (!/^cand_\d{4}$/.test(id))
      throw new ApiError(404, "NOT_FOUND", "This candidate was not found.");
    return json(await readCandidate(supabase, id));
  });
}
