import {
  ApiError,
  json,
  onlyKeys,
  readObject,
  uuidValue,
  withRecruiter,
} from "@/lib/api";
import { validateSearchFilters } from "@/lib/search/schema";
import { executeSearch, requestKey } from "@/lib/search/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRecruiter(request, async (context) => {
    const id = uuidValue((await params).id);
    const body = await readObject(request);
    onlyKeys(body, []);
    const { data, error } = await context.supabase
      .from("saved_briefs")
      .select("brief,filters")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("Saved search read failed");
    if (!data)
      throw new ApiError(404, "NOT_FOUND", "This saved search was not found.");
    const filters = validateSearchFilters(data.filters);
    if (!filters)
      throw new ApiError(
        400,
        "INVALID_FILTERS",
        "This saved search has unsupported filters. Create a new search.",
      );
    return json(
      await executeSearch(context, data.brief, requestKey(request), filters),
    );
  });
}
