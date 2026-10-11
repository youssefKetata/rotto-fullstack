import {
  json,
  nameValue,
  onlyKeys,
  readObject,
  withRecruiter,
} from "@/lib/api";

export async function GET(request: Request) {
  return withRecruiter(request, async ({ supabase }) => {
    const { data, error } = await supabase
      .from("shortlists")
      .select("id,name,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Shortlists read failed");
    return json(data ?? []);
  });
}

export async function POST(request: Request) {
  return withRecruiter(request, async ({ supabase }) => {
    const body = await readObject(request);
    onlyKeys(body, ["name"]);
    const { data, error } = await supabase
      .from("shortlists")
      .insert({ name: nameValue(body.name) })
      .select("id")
      .single();
    if (error) throw new Error("Shortlist creation failed");
    return json(data, 201);
  });
}
