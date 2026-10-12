import { SEARCH_LIMITS } from "@/lib/search/schema";

export type WorkspaceSession = {
  draft: string;
  activeSearchId: string | null;
  lastSearchId: string | null;
};

type HistoryDraft = {
  identity: string;
  searchId: string | null;
  draft: string;
};

export function readWorkspaceSession(raw: string | null): WorkspaceSession {
  try {
    const saved = JSON.parse(raw ?? "null");
    const lastSearchId =
      typeof saved?.lastSearchId === "string" ? saved.lastSearchId : null;
    return {
      draft:
        typeof saved?.draft === "string"
          ? saved.draft.slice(0, SEARCH_LIMITS.maxBriefLength)
          : "",
      activeSearchId:
        typeof saved?.activeSearchId === "string"
          ? saved.activeSearchId
          : saved?.activeSearchId === null
            ? null
            : lastSearchId,
      lastSearchId,
    };
  } catch {
    return { draft: "", activeSearchId: null, lastSearchId: null };
  }
}

/** A previous search is a resume option, never an implicit destination. */
export function workspaceEntry(
  url: URL,
  saved: WorkspaceSession,
  historyDraft: HistoryDraft | undefined,
  identity: string,
) {
  const searchId = url.searchParams.get("search");
  const fresh = !searchId && url.searchParams.get("new") === "1";
  let draft: string | undefined;
  if (fresh) draft = "";
  else if (
    historyDraft?.identity === identity &&
    historyDraft.searchId === searchId &&
    typeof historyDraft.draft === "string"
  ) {
    draft = historyDraft.draft.slice(0, SEARCH_LIMITS.maxBriefLength);
  } else if (saved.activeSearchId === searchId) draft = saved.draft;
  return { searchId, draft };
}
