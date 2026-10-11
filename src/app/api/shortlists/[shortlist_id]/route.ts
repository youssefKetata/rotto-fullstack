import {
  ApiError,
  json,
  nameValue,
  onlyKeys,
  readObject,
  uuidValue,
  withRecruiter,
} from "@/lib/api";

type Params = { params: Promise<{ shortlist_id: string }> };

export async function GET(request: Request, { params }: Params) {
  return withRecruiter(request, async ({ supabase }) => {
    const id = uuidValue((await params).shortlist_id);
    const { data, error } = await supabase
      .from("shortlists")
      .select("id,name,created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("Shortlist read failed");
    if (!data)
      throw new ApiError(404, "NOT_FOUND", "This shortlist was not found.");
    const people: object[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await supabase
        .from("shortlist_people")
        .select(
          "candidate_id,person:candidates(*,experiences:candidate_experiences(*),education:candidate_education(*))",
        )
        .eq("shortlist_id", id)
        .order("candidate_id")
        .range(offset, offset + 999);
      if (page.error) throw new Error("Shortlist people read failed");
      people.push(...(page.data ?? []).map((row) => row.person));
      if ((page.data?.length ?? 0) < 1000) break;
    }
    return json({ ...data, people });
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return withRecruiter(request, async ({ supabase }) => {
    const id = uuidValue((await params).shortlist_id);
    const body = await readObject(request);
    onlyKeys(body, ["name"]);
    const { data, error } = await supabase
      .from("shortlists")
      .update({ name: nameValue(body.name) })
      .eq("id", id)
      .select("id,name")
      .maybeSingle();
    if (error) throw new Error("Shortlist rename failed");
    if (!data)
      throw new ApiError(404, "NOT_FOUND", "This shortlist was not found.");
    return json(data);
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return withRecruiter(request, async ({ supabase }) => {
    const id = uuidValue((await params).shortlist_id);
    const { data, error } = await supabase
      .from("shortlists")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Shortlist deletion failed");
    if (!data)
      throw new ApiError(404, "NOT_FOUND", "This shortlist was not found.");
    return json({ ok: true });
  });
}
