"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { searchApi } from "@/lib/search/browser";
import type {
  CompanyPlan,
  Shortlist,
  SavedBrief,
  SearchResponse,
} from "@/lib/search/contracts";
import type { Candidate } from "@/lib/search/types";
import {
  errorMessage as message,
  updateWorkspaceUrl,
  type WorkspaceIdentity,
} from "../workspace-state";
import { readWorkspaceSession, workspaceEntry } from "../workspace-session";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Options = WorkspaceIdentity & {
  brief: string;
  search: SearchResponse | null;
  previousSearchId: string | null;
  setPreviousSearchId: Setter<string | null>;
  clearSearch: () => void;
  setBrief: Setter<string>;
  setPlan: Setter<CompanyPlan | null>;
  setLists: Setter<Shortlist[]>;
  setActiveList: Setter<string | null>;
  setSavedBriefs: Setter<SavedBrief[]>;
  setCandidate: Setter<Candidate | null>;
  setError: Setter<string>;
  accept: (result: SearchResponse) => void;
  loadList: (id: string, signal?: AbortSignal) => Promise<Candidate[]>;
};

/** Restores server state and an optional identity-scoped draft, without spending quota. */
export function useWorkspaceSession({
  companyId,
  recruiterId,
  brief,
  search,
  previousSearchId,
  setPreviousSearchId,
  clearSearch,
  setBrief,
  setPlan,
  setLists,
  setActiveList,
  setSavedBriefs,
  setCandidate,
  setError,
  accept,
  loadList,
}: Options) {
  const [ready, setReady] = useState(false);
  const storageKey =
    companyId && recruiterId
      ? `rotto-workspace-v1:${companyId}:${recruiterId}`
      : null;
  useEffect(() => {
    if (!storageKey) return;
    const key = storageKey;
    const controller = new AbortController();
    let active = true;
    function entry() {
      let raw = null;
      try {
        raw = sessionStorage.getItem(key);
      } catch {
        /* Storage is optional; the database remains authoritative. */
      }
      const saved = readWorkspaceSession(raw);
      const url = new URL(window.location.href);
      return {
        url,
        saved,
        ...workspaceEntry(
          url,
          saved,
          window.history.state?.rottoWorkspace,
          key,
        ),
      };
    }
    async function restore() {
      const { url, saved, searchId: id, draft } = entry();
      const jobs = await Promise.allSettled([
        searchApi<CompanyPlan>("/api/plan", { signal: controller.signal }),
        searchApi<Shortlist[]>("/api/shortlists", {
          signal: controller.signal,
        }),
        searchApi<SavedBrief[]>("/api/saved-briefs", {
          signal: controller.signal,
        }),
        id
          ? searchApi<SearchResponse>(
              `/api/search/${encodeURIComponent(id)}?page=1`,
              { signal: controller.signal },
            )
          : Promise.resolve(null),
      ] as const);
      if (!active) return;
      if (jobs[0].status === "fulfilled") setPlan(jobs[0].value);
      if (jobs[1].status === "fulfilled") {
        const next = jobs[1].value;
        setLists(next);
        if (next[0]) {
          setActiveList(next[0].id);
        }
        void Promise.all(
          next.map((list) => loadList(list.id, controller.signal)),
        ).catch((cause) => {
          if (active) setError(message(cause));
        });
      }
      if (jobs[2].status === "fulfilled") setSavedBriefs(jobs[2].value);
      setPreviousSearchId(saved.lastSearchId);
      if (jobs[3].status === "fulfilled" && jobs[3].value) {
        accept(jobs[3].value);
        if (draft !== undefined) setBrief(draft);
      } else {
        clearSearch();
        setBrief(draft ?? "");
      }
      // Consume the sign-in marker so refreshing can restore a new draft.
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("new");
      window.history.replaceState(window.history.state, "", currentUrl);
      const failure = jobs.find((job) => job.status === "rejected");
      if (failure?.status === "rejected") setError(message(failure.reason));
      setReady(true);
      const personId = url.searchParams.get("candidate");
      if (personId) {
        try {
          const person = await searchApi<Candidate>(
            `/api/people/${encodeURIComponent(personId)}`,
            { signal: controller.signal },
          );
          if (active) {
            setCandidate(person);
            updateWorkspaceUrl(id, personId);
          }
        } catch (cause) {
          if (active) setError(message(cause));
        }
      }
    }
    async function fromHistory() {
      const { url, searchId: id, draft } = entry();
      try {
        if (id) {
          const result = await searchApi<SearchResponse>(
            `/api/search/${encodeURIComponent(id)}?page=1`,
            { signal: controller.signal },
          );
          if (active) {
            accept(result);
            if (draft !== undefined) setBrief(draft);
          }
        } else if (active) {
          clearSearch();
          setBrief(draft ?? "");
        }
        const personId = url.searchParams.get("candidate");
        if (personId) {
          const person = await searchApi<Candidate>(
            `/api/people/${encodeURIComponent(personId)}`,
            { signal: controller.signal },
          );
          if (active) {
            setCandidate(person);
            updateWorkspaceUrl(id, personId);
          }
        } else if (active) setCandidate(null);
      } catch (cause) {
        if (active) setError(message(cause));
      }
    }
    void restore();
    window.addEventListener("popstate", fromHistory);
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener("popstate", fromHistory);
    };
    // Restore identity-scoped data; never execute a metered search in an effect.
  }, [
    storageKey,
    accept,
    loadList,
    setLists,
    setActiveList,
    setPlan,
    setSavedBriefs,
    setBrief,
    setCandidate,
    setError,
    setPreviousSearchId,
    clearSearch,
  ]);

  useEffect(() => {
    if (!storageKey || !ready) return;
    const searchId = search?.search_id ?? null;
    // Each history entry retains its own draft, including the new-search page.
    window.history.replaceState(
      {
        ...window.history.state,
        rottoWorkspace: { identity: storageKey, searchId, draft: brief },
      },
      "",
    );
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          draft: brief,
          activeSearchId: searchId,
          lastSearchId: previousSearchId,
        }),
      );
    } catch {
      /* A draft may be lost; results and lists are saved on the server. */
    }
  }, [storageKey, ready, brief, search?.search_id, previousSearchId]);

  return ready;
}
