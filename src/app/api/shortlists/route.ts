import {
  listShortlists,
  createShortlist,
  createShortlistWithMember,
} from "@/lib/data/shortlists";
import {
  ApiError,
  json,
  nameValue,
  onlyKeys,
  readObject,
  uuidValue,
  withRecruiter,
} from "@/lib/api";

export async function GET(request: Request) {
  return withRecruiter(request, async ({ supabase }) => {
    return json(await listShortlists(supabase));
  });
}

export async function POST(request: Request) {
  return withRecruiter(request, async ({ supabase, recruiter }) => {
    const body = await readObject(request);
    onlyKeys(body, ["name", "candidateId", "listId"]);
    const name = nameValue(body.name);
    if (body.candidateId === undefined && body.listId === undefined) {
      return json(await createShortlist(supabase, name), 201);
    }
    if (
      typeof body.candidateId !== "string" ||
      !/^cand_\d{4}$/.test(body.candidateId)
    ) {
      throw new ApiError(404, "NOT_FOUND", "This candidate was not found.");
    }
    if (typeof body.listId !== "string") {
      throw new ApiError(400, "INVALID_REQUEST", "Use a valid shortlist ID.");
    }
    return json(
      await createShortlistWithMember(
        recruiter.id,
        uuidValue(body.listId),
        name,
        body.candidateId,
      ),
      201,
    );
  });
}
