import {
  ApiError,
  json,
  onlyKeys,
  readObject,
  uuidValue,
  withRecruiter,
} from "@/lib/api";
import { mutateShortlistMembership } from "@/lib/search/shortlist-membership";

type Params = { params: Promise<{ shortlist_id: string; person_id: string }> };

async function mutate(
  request: Request,
  params: Params["params"],
  add: boolean,
) {
  return withRecruiter(request, async ({ recruiter }) => {
    const { shortlist_id, person_id } = await params;
    const listId = uuidValue(shortlist_id);
    if (!/^cand_\d{4}$/.test(person_id))
      throw new ApiError(404, "NOT_FOUND", "This candidate was not found.");
    let restoreAddedAt: string | undefined;
    if (add && request.body) {
      const body = await readObject(request, 1000, true);
      onlyKeys(body, ["restoreAddedAt"]);
      if (body.restoreAddedAt !== undefined) {
        if (
          typeof body.restoreAddedAt !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(
            body.restoreAddedAt,
          ) ||
          !Number.isFinite(Date.parse(body.restoreAddedAt)) ||
          Date.parse(body.restoreAddedAt) > Date.now()
        )
          throw new ApiError(
            400,
            "INVALID_REQUEST",
            "Use a valid original membership timestamp.",
          );
        restoreAddedAt = body.restoreAddedAt;
      }
    }
    return json(
      await mutateShortlistMembership(
        recruiter.id,
        listId,
        person_id,
        add,
        restoreAddedAt,
      ),
    );
  });
}

export async function POST(request: Request, { params }: Params) {
  return mutate(request, params, true);
}
export async function DELETE(request: Request, { params }: Params) {
  return mutate(request, params, false);
}
