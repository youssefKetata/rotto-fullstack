import { listShortlists, createShortlist } from "@/lib/search/shortlists";
import {
  json,
  nameValue,
  onlyKeys,
  readObject,
  withRecruiter,
} from "@/lib/api";

export async function GET(request: Request) {
  return withRecruiter(request, async ({ supabase }) => {
    return json(await listShortlists(supabase));
  });
}

export async function POST(request: Request) {
  return withRecruiter(request, async ({ supabase }) => {
    const body = await readObject(request);
    onlyKeys(body, ["name"]);
    return json(await createShortlist(supabase, nameValue(body.name)), 201);
  });
}
