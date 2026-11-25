import {
  readShortlist,
  renameShortlist,
  deleteShortlist,
} from "@/lib/search/shortlists";
import {
  json,
  nameValue,
  onlyKeys,
  readObject,
  uuidValue,
  withRecruiter,
} from "@/lib/api";

type Params = { params: Promise<{ shortlist_id: string }> };

export async function GET(request: Request, { params }: Params) {
  return withRecruiter(request, async ({ supabase }) => {
    const id = uuidValue((await params).shortlist_id);
    return json(await readShortlist(supabase, id));
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return withRecruiter(request, async ({ supabase }) => {
    const id = uuidValue((await params).shortlist_id);
    const body = await readObject(request);
    onlyKeys(body, ["name"]);
    return json(await renameShortlist(supabase, id, nameValue(body.name)));
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return withRecruiter(request, async ({ supabase }) => {
    const id = uuidValue((await params).shortlist_id);
    return json(await deleteShortlist(supabase, id));
  });
}
