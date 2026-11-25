import {
  ApiError,
  briefValue,
  json,
  onlyKeys,
  readObject,
  withRecruiter,
} from "@/lib/api";
import { validateSearchFilters } from "@/lib/search/schema";
import { saveBrief, savedBriefsForRecruiter } from "@/lib/search/saved-briefs";

export async function GET(request: Request) {
  return withRecruiter(request, async ({ recruiter }) => {
    return json(await savedBriefsForRecruiter(recruiter.id));
  });
}

export async function POST(request: Request) {
  return withRecruiter(request, async (context) => {
    const body = await readObject(request);
    onlyKeys(body, ["brief", "filters"]);
    const filters = validateSearchFilters(body.filters);
    if (!filters)
      throw new ApiError(
        400,
        "INVALID_FILTERS",
        "Choose valid search filters.",
      );
    const { saved, created } = await saveBrief(
      context,
      briefValue(body.brief),
      filters,
    );
    return json(saved, created ? 201 : 200);
  });
}
