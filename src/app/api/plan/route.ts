import { json, withRecruiter } from "@/lib/api";
import { planFor } from "@/lib/search/service";

export async function GET(request: Request) {
  return withRecruiter(request, async (context) =>
    json(await planFor(context)),
  );
}
