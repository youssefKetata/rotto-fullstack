import type { Shortlist } from "@/lib/search/contracts";

export type WorkspaceIdentity = {
  companyId?: string;
  recruiterId?: string;
};

export type SearchOperation = {
  path: string;
  body: object;
  key: string;
};
export type NameAction =
  { kind: "create" } | { kind: "rename"; list: Shortlist };

export function errorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "Couldn’t connect. Please try again.";
}

export function updateWorkspaceUrl(
  searchId: string | null,
  personId: string | null = null,
) {
  const url = new URL(window.location.href);
  if (searchId) url.searchParams.set("search", searchId);
  else url.searchParams.delete("search");
  if (personId) url.searchParams.set("candidate", personId);
  else url.searchParams.delete("candidate");
  window.history.replaceState(window.history.state, "", url);
}
