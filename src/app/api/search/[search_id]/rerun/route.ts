import {
  ApiError,
  json,
  onlyKeys,
  readObject,
  uuidValue,
  withRecruiter,
} from "@/lib/api";
import { executeSearch, requestKey } from "@/lib/search/service";
import { validateSearchFilters } from "@/lib/search/schema";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ search_id: string }> },
) {
  return withRecruiter(request, async (context) => {
    const { search_id } = await params;
    const body = await readObject(request);
    onlyKeys(body, ["filters"]);
    const filters = validateSearchFilters(body.filters);
    if (!filters)
      throw new ApiError(
        400,
        "INVALID_FILTERS",
        "Choose valid search filters.",
      );
    const { data, error } = await context.supabase
      .from("searches")
      .select("brief,status")
      .eq("id", uuidValue(search_id))
      .maybeSingle();
    if (error) throw new Error("Search read failed");
    if (!data || data.status !== "completed")
      throw new ApiError(404, "NOT_FOUND", "This search was not found.");
    return json(
      await executeSearch(context, data.brief, requestKey(request), filters),
    );
  });
}
