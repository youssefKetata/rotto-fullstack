import {
  briefValue,
  json,
  onlyKeys,
  readObject,
  withRecruiter,
} from "@/lib/api";
import { executeSearch, requestKey } from "@/lib/search/service";

export async function POST(request: Request) {
  return withRecruiter(request, async (context) => {
    const body = await readObject(request);
    onlyKeys(body, ["brief"]);
    return json(
      await executeSearch(context, briefValue(body.brief), requestKey(request)),
    );
  });
}

export async function GET(request: Request) {
  return withRecruiter(request, async ({ supabase }) => {
    const { data, error } = await supabase
      .from("searches")
      .select("id,brief,filters,total,status,created_at")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Search history unavailable");
    return json(data ?? []);
  });
}
