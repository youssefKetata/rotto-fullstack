import { readCompletedSearch } from "@/lib/data/search-history";
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
    const data = await readCompletedSearch(
      context.supabase,
      uuidValue(search_id),
    );
    return json(
      await executeSearch(context, data.brief, requestKey(request), filters),
    );
  });
}
