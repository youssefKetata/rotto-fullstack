import {
  ApiError,
  json,
  nameValue,
  onlyKeys,
  readObject,
  uuidValue,
  withRecruiter,
} from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return withRecruiter(request, async ({ supabase }) => {
    const id = uuidValue((await params).id);
    const body = await readObject(request);
    onlyKeys(body, ["name"]);
    const { data, error } = await supabase
      .from("saved_briefs")
      .update({ name: nameValue(body.name) })
      .eq("id", id)
      .select("id,name")
      .maybeSingle();
    if (error) throw new Error("Saved search rename failed");
    if (!data)
      throw new ApiError(404, "NOT_FOUND", "This saved search was not found.");
    return json(data);
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return withRecruiter(request, async ({ supabase }) => {
    const id = uuidValue((await params).id);
    const { data, error } = await supabase
      .from("saved_briefs")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Saved search removal failed");
    if (!data)
      throw new ApiError(404, "NOT_FOUND", "This saved search was not found.");
    return json({ ok: true });
  });
}
