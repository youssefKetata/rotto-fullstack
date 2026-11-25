import { listSearchHistory } from "@/lib/search/search-history";
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
    return json(await listSearchHistory(supabase));
  });
}
