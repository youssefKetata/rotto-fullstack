import { ApiError, json, uuidValue, withRecruiter } from "@/lib/api";

type Params = { params: Promise<{ shortlist_id: string; person_id: string }> };

async function mutate(
  request: Request,
  params: Params["params"],
  add: boolean,
) {
  return withRecruiter(request, async ({ supabase }) => {
    const { shortlist_id, person_id } = await params;
    const listId = uuidValue(shortlist_id);
    if (!/^cand_\d{4}$/.test(person_id))
      throw new ApiError(404, "NOT_FOUND", "This candidate was not found.");
    const parent = await supabase
      .from("shortlists")
      .select("id")
      .eq("id", listId)
      .maybeSingle();
    if (parent.error) throw new Error("Shortlist read failed");
    if (!parent.data)
      throw new ApiError(404, "NOT_FOUND", "This shortlist was not found.");
    if (add) {
      const person = await supabase
        .from("candidates")
        .select("id")
        .eq("id", person_id)
        .maybeSingle();
      if (person.error) throw new Error("Candidate read failed");
      if (!person.data)
        throw new ApiError(404, "NOT_FOUND", "This candidate was not found.");
      const { error } = await supabase
        .from("shortlist_people")
        .upsert(
          { shortlist_id: listId, candidate_id: person_id },
          { onConflict: "shortlist_id,candidate_id", ignoreDuplicates: true },
        );
      if (error) throw new Error("Shortlist addition failed");
    } else {
      const { error } = await supabase
        .from("shortlist_people")
        .delete()
        .eq("shortlist_id", listId)
        .eq("candidate_id", person_id);
      if (error) throw new Error("Shortlist removal failed");
    }
    return json({ ok: true });
  });
}

export async function POST(request: Request, { params }: Params) {
  return mutate(request, params, true);
}
export async function DELETE(request: Request, { params }: Params) {
  return mutate(request, params, false);
}
