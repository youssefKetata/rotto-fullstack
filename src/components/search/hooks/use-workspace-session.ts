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

type Setter<T> = Dispatch<SetStateAction<T>>;
type Options = WorkspaceIdentity & {
  brief: string;
  search: SearchResponse | null;
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
    async function restore() {
      let lastId: string | null = null;
      let draft = "";
      try {
        const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as {
          draft?: string;
          lastSearchId?: string;
        } | null;
        draft =
          typeof saved?.draft === "string" ? saved.draft.slice(0, 4000) : "";
        lastId =
          typeof saved?.lastSearchId === "string" ? saved.lastSearchId : null;
      } catch {
        /* Storage is optional; the database remains authoritative. */
      }
      const url = new URL(window.location.href);
      const id = url.searchParams.get("search") ?? lastId;
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
      if (jobs[3].status === "fulfilled" && jobs[3].value)
        accept(jobs[3].value);
      else setBrief(draft);
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
      const url = new URL(window.location.href);
      const id = url.searchParams.get("search");
      try {
        if (id) {
          const result = await searchApi<SearchResponse>(
            `/api/search/${encodeURIComponent(id)}?page=1`,
            { signal: controller.signal },
          );
          if (active) accept(result);
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
  ]);

  useEffect(() => {
    if (!storageKey || !ready) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          draft: brief,
          lastSearchId: search?.search_id ?? null,
        }),
      );
    } catch {
      /* A draft may be lost; results and lists are saved on the server. */
    }
  }, [storageKey, ready, brief, search?.search_id]);

  return ready;
}
