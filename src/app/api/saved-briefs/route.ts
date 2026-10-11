import {
  ApiError,
  briefValue,
  json,
  onlyKeys,
  readObject,
  withRecruiter,
} from "@/lib/api";
import { validateSearchFilters } from "@/lib/search/schema";

export async function GET(request: Request) {
  return withRecruiter(request, async ({ supabase }) => {
    const { data, error } = await supabase
      .from("saved_briefs")
      .select("id,brief,filters,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Saved searches read failed");
    return json(data ?? []);
  });
}

export async function POST(request: Request) {
  return withRecruiter(request, async ({ supabase, recruiter }) => {
    const body = await readObject(request);
    onlyKeys(body, ["brief", "filters"]);
    const filters = validateSearchFilters(body.filters);
    if (!filters)
      throw new ApiError(
        400,
        "INVALID_FILTERS",
        "Choose valid search filters.",
      );
    const brief = briefValue(body.brief);
    const { data, error } = await supabase
      .from("saved_briefs")
      .insert({ brief, filters })
      .select("id,brief,filters,created_at")
      .single();
    // The unique index also covers simultaneous saves from other tabs/recruiters.
    if (error?.code === "23505") {
      const existing = await supabase
        .from("saved_briefs")
        .select("id,brief,filters,created_at")
        .eq("company_id", recruiter.company_id)
        .eq("brief", brief)
        .eq("filters", JSON.stringify(filters))
        .single();
      if (existing.error) throw new Error("Saved search read failed");
      return json(existing.data);
    }
    if (error) throw new Error("Saving search failed");
    return json(data, 201);
  });
}
