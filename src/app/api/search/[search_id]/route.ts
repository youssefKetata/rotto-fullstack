import { ApiError, json, uuidValue, withRecruiter } from "@/lib/api";
import { readSearch, readSearchRows } from "@/lib/search/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ search_id: string }> },
) {
  return withRecruiter(request, async (context) => {
    const { search_id } = await params;
    const query = new URL(request.url).searchParams;
    const pages = query.getAll("page");
    const raw = pages[0] ?? "1";
    if (pages.length > 1 || !/^[1-9]\d{0,6}$/.test(raw))
      throw new ApiError(
        400,
        "INVALID_PAGE",
        "Choose a page number starting from 1.",
      );
    const views = query.getAll("view");
    if (views.length > 1 || (views.length === 1 && views[0] !== "rows")) {
      throw new ApiError(400, "INVALID_VIEW", "Choose a valid result view.");
    }
    const id = uuidValue(search_id);
    const page = Number(raw);
    return json(
      views.length
        ? await readSearchRows(context, id, page)
        : await readSearch(context, id, page),
    );
  });
}
