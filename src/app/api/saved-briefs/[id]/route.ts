import { renameSavedBrief, deleteSavedBrief } from "@/lib/search/saved-briefs";
import {
  json,
  nameValue,
  onlyKeys,
  readObject,
  uuidValue,
  withRecruiter,
} from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return withRecruiter(request, async ({ supabase }) => {
    const id = uuidValue((await params).id);
    const body = await readObject(request);
    onlyKeys(body, ["name"]);
    return json(await renameSavedBrief(supabase, id, nameValue(body.name)));
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return withRecruiter(request, async ({ supabase }) => {
    const id = uuidValue((await params).id);
    return json(await deleteSavedBrief(supabase, id));
  });
}
