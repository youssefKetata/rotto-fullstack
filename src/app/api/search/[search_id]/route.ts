import { ApiError, json, uuidValue, withRecruiter } from "@/lib/api";
import { readSearch } from "@/lib/search/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ search_id: string }> },
) {
  return withRecruiter(request, async (context) => {
    const { search_id } = await params;
    const raw = new URL(request.url).searchParams.get("page") ?? "1";
    if (!/^[1-9]\d{0,6}$/.test(raw))
      throw new ApiError(
        400,
        "INVALID_PAGE",
        "Choose a page number starting from 1.",
      );
    return json(await readSearch(context, uuidValue(search_id), Number(raw)));
  });
}
