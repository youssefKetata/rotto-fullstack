"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SearchApiError, searchApi } from "@/lib/search/browser";
import type {
  CompanyPlan,
  SearchResponse,
  SavedBrief,
} from "@/lib/search/contracts";
import { SEARCH_PAGE_SIZE } from "@/lib/search/contracts";
import type { SearchFilters } from "@/lib/search/schema";
import { savedSearchKey } from "@/lib/search/saved-search";
import type { Candidate } from "@/lib/search/types";
import { requestedSkills } from "../filter-summary";
import {
  errorMessage as message,
  updateWorkspaceUrl,
  type SearchOperation,
  type WorkspaceIdentity,
} from "../workspace-state";
import { useShortlists } from "./use-shortlists";
import { useWorkspaceSession } from "./use-workspace-session";

/** Coordinates search execution, restoration, and profile navigation. */
export function useSearchWorkspace({
  companyId,
  recruiterId,
}: WorkspaceIdentity) {
  const [brief, setBrief] = useState("");
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [previousSearchId, setPreviousSearchId] = useState<string | null>(null);
  const [filters, setFilters] = useState<SearchFilters | null>(null);
  const [plan, setPlan] = useState<CompanyPlan | null>(null);
  const [view, setView] = useState<"search" | "shortlists" | "saved">("search");

  const [savedBriefs, setSavedBriefs] = useState<SavedBrief[]>([]);
  const [savedName, setSavedName] = useState<SavedBrief | null>(null);
  const [savedRemoval, setSavedRemoval] = useState<SavedBrief | null>(null);
  const [savedPending, setSavedPending] = useState(false);
  const [savedError, setSavedError] = useState("");
  const savedBusy = useRef(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [drawerSnapshot, setDrawerSnapshot] = useState<{
    people: Candidate[];
    listId: string | null;
  } | null>(null);

  const [editFilters, setEditFilters] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const [pending, setPending] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [paging, setPaging] = useState(false);

  const [saving, setSaving] = useState(false);
  const [planPending, setPlanPending] = useState(false);
  const [error, setError] = useState("");

  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState<SearchOperation | null>(null);
  const [pageError, setPageError] = useState("");
  const shortlists = useShortlists({ setError, setNotice });
  const { lists, setLists, listPeople, activeList, setActiveList, loadList } =
    shortlists;
  const busy = useRef(false);
  const pageBusy = useRef(false);
  const saveBusy = useRef(false);
  const lastOperation = useRef<SearchOperation | null>(null);
  const count = useRef<HTMLHeadingElement>(null);
  const profileRequest = useRef<AbortController | null>(null);
  const adjusted =
    !!search &&
    !!filters &&
    JSON.stringify(filters) !== JSON.stringify(search.filters);
  const exhausted = plan?.plan === "free" && plan.searches_remaining === 0;
  const rerunning = savedBriefs.find(
    (saved) =>
      pendingPath === `/api/saved-briefs/${encodeURIComponent(saved.id)}/rerun`,
  );
  const searchSaved =
    !!search &&
    !!filters &&
    savedBriefs.some(
      (saved) =>
        savedSearchKey(saved) ===
        savedSearchKey({ brief: search.brief, filters }),
    );
  const liveVisible =
    view === "shortlists"
      ? (listPeople[activeList ?? ""] ?? [])
      : (search?.results ?? []);
  const visible =
    candidate &&
    view === "shortlists" &&
    drawerSnapshot &&
    drawerSnapshot.listId === activeList
      ? drawerSnapshot.people
      : liveVisible;
  const profilePeople = drawerSnapshot?.people ?? liveVisible;
  const matched = requestedSkills(search?.filters ?? null);
  const currentList = lists.find((list) => list.id === activeList);
  const savedIds = new Set(
    Object.values(listPeople).flatMap((people) =>
      people.map((person) => person.id),
    ),
  );
  const planNote = !plan
    ? "Checking your company’s plan…"
    : plan.plan === "paid"
      ? "Paid plan · New searches and refinements available."
      : exhausted
        ? "Free search used · Your results and lists stay available."
        : "Your company’s first search is free · 1 search remaining.";

  const accept = useCallback((result: SearchResponse) => {
    setSearch(result);
    setPreviousSearchId(result.search_id);
    setFilters(structuredClone(result.filters));
    setBrief(result.brief);
    setPlan({
      plan: result.searches_remaining === null ? "paid" : "free",
      searches_remaining: result.searches_remaining,
    });
    setView("search");
    setCandidate(null);
    setDrawerSnapshot(null);
    setError("");
    setPageError("");
    updateWorkspaceUrl(result.search_id);
    setNotice(
      `${result.total} ${result.total === 1 ? "candidate" : "candidates"} found.`,
    );
    requestAnimationFrame(() => count.current?.focus({ preventScroll: true }));
  }, []);
  async function refreshPlan() {
    setPlanPending(true);
    try {
      const next = await searchApi<CompanyPlan>("/api/plan");
      setPlan(next);
      if (next.plan === "paid") setUpgrade(false);
      return next;
    } catch (cause) {
      setError(message(cause));
      return null;
    } finally {
      setPlanPending(false);
    }
  }
  const clearSearch = useCallback(() => {
    setSearch(null);
    setFilters(null);
    setView("search");
    setCandidate(null);
    setDrawerSnapshot(null);
    setError("");
    setPageError("");
  }, []);
  const ready = useWorkspaceSession({
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
  });
  useEffect(() => () => profileRequest.current?.abort(), []);

  async function execute(operation: SearchOperation) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setPendingPath(operation.path);
    const saved = savedBriefs.find(
      (item) =>
        operation.path ===
        `/api/saved-briefs/${encodeURIComponent(item.id)}/rerun`,
    );
    setError("");
    setRetry(null);
    try {
      const result = await searchApi<SearchResponse>(operation.path, {
        method: "POST",
        headers: { "Idempotency-Key": operation.key },
        body: JSON.stringify(operation.body),
      });
      accept(result);
      lastOperation.current = null;
    } catch (cause) {
      if (saved) setView("saved");
      setError(message(cause));
      if (cause instanceof SearchApiError && cause.status === 402) {
        setPlan({ plan: "free", searches_remaining: 0 });
        setUpgrade(true);
      } else if (
        !(cause instanceof SearchApiError) ||
        cause.status >= 500 ||
        cause.status === 409
      )
        setRetry(operation);
    } finally {
      busy.current = false;
      setPending(false);
      setPendingPath(null);
      void refreshPlan();
    }
  }
  function startOperation(path: string, body: object) {
    if (pending || !ready) return;
    if (exhausted) {
      setUpgrade(true);
      return;
    }
    const previous = lastOperation.current;
    const operation =
      previous?.path === path &&
      JSON.stringify(previous.body) === JSON.stringify(body)
        ? previous
        : { path, body, key: crypto.randomUUID() };
    lastOperation.current = operation;
    void execute(operation);
  }
  async function more() {
    if (!search || pageBusy.current || pending) return;
    pageBusy.current = true;
    setPaging(true);
    setPageError("");
    const id = search.search_id;
    const nextPage = search.page + 1;
    try {
      const next = await searchApi<SearchResponse>(
        `/api/search/${encodeURIComponent(id)}?page=${nextPage}`,
      );
      setSearch((previous) =>
        previous?.search_id === id
          ? {
              ...previous,
              results: [...previous.results, ...next.results],
              page: nextPage,
            }
          : previous,
      );
      setNotice(
        `${Math.min(nextPage * SEARCH_PAGE_SIZE, next.total)} of ${next.total} candidates shown.`,
      );
    } catch (cause) {
      setPageError(message(cause));
    } finally {
      pageBusy.current = false;
      setPaging(false);
    }
  }
  async function openPerson(person: Candidate) {
    if (!candidate)
      setDrawerSnapshot({
        people: [...visible],
        listId: view === "shortlists" ? activeList : null,
      });
    profileRequest.current?.abort();
    const controller = new AbortController();
    profileRequest.current = controller;
    setNotice(`Opening ${person.full_name}…`);
    try {
      const full = await searchApi<Candidate>(
        `/api/people/${encodeURIComponent(person.id)}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setCandidate(full);
        updateWorkspaceUrl(search?.search_id ?? null, full.id);
        setNotice(`${full.full_name} profile opened.`);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(message(cause));
    }
  }
  function closePerson() {
    profileRequest.current?.abort();
    setCandidate(null);
    setDrawerSnapshot(null);
    updateWorkspaceUrl(search?.search_id ?? null);
  }
  async function saveSearch() {
    if (
      !search ||
      !filters ||
      saveBusy.current ||
      searchSaved ||
      pending ||
      !ready
    )
      return;
    saveBusy.current = true;
    setSaving(true);
    setError("");
    try {
      const created = await searchApi<SavedBrief>("/api/saved-briefs", {
        method: "POST",
        body: JSON.stringify({ brief: search.brief, filters }),
      });
      setSavedBriefs((previous) =>
        previous.some((saved) => saved.id === created.id)
          ? previous
          : [created, ...previous],
      );
      setNotice("Search saved for your company.");
    } catch (cause) {
      setError(message(cause));
    } finally {
      saveBusy.current = false;
      setSaving(false);
    }
  }
  function startOver() {
    if (pending) return;
    setSearch(null);
    setFilters(null);
    setBrief("");
    setError("");
    setRetry(null);
    setView("search");
    closePerson();
    updateWorkspaceUrl(null);
    requestAnimationFrame(() =>
      document.getElementById("candidate-brief")?.focus(),
    );
  }
  function showLists() {
    setView("shortlists");
    setError("");
    if (activeList) void shortlists.selectList(activeList);
  }
  async function showSaved() {
    setView("saved");
    setError("");
    try {
      setSavedBriefs(await searchApi<SavedBrief[]>("/api/saved-briefs"));
    } catch (cause) {
      setError(message(cause));
    }
  }
  async function editSaved(name?: string) {
    const target = name === undefined ? savedRemoval : savedName;
    if (!target || savedBusy.current) return;
    savedBusy.current = true;
    setSavedPending(true);
    setSavedError("");
    try {
      const result = await searchApi<{ name?: string }>(
        `/api/saved-briefs/${encodeURIComponent(target.id)}`,
        {
          method: name === undefined ? "DELETE" : "PATCH",
          ...(name === undefined ? {} : { body: JSON.stringify({ name }) }),
        },
      );
      setSavedBriefs((previous) =>
        name === undefined
          ? previous.filter((saved) => saved.id !== target.id)
          : previous.map((saved) =>
              saved.id === target.id ? { ...saved, name: result.name } : saved,
            ),
      );
      setSavedName(null);
      setSavedRemoval(null);
      setNotice(
        name === undefined
          ? "Saved search removed. Results remain available."
          : "Saved search renamed.",
      );
    } catch (cause) {
      setSavedError(message(cause));
    } finally {
      savedBusy.current = false;
      setSavedPending(false);
    }
  }

  return {
    ...shortlists,
    brief,
    setBrief,
    search,
    filters,
    setFilters,
    plan,
    view,
    setView,
    savedBriefs,
    savedName,
    setSavedName,
    savedRemoval,
    setSavedRemoval,
    savedPending,
    savedError,
    setSavedError,
    editSaved,
    showSaved,
    candidate,
    editFilters,
    setEditFilters,
    upgrade,
    setUpgrade,
    pending,
    rerunning,
    paging,
    saving,
    searchSaved,
    planPending,
    ready,
    previousSearchId,
    error,
    setError,
    notice,
    setNotice,
    retry,
    pageError,
    count,
    adjusted,
    exhausted,
    visible,
    profilePeople,
    matched,
    currentList,
    savedIds,
    planNote,
    refreshPlan,
    execute,
    startOperation,
    more,
    openPerson,
    closePerson,
    saveSearch,
    startOver,
    showLists,
  };
}

export type WorkspaceModel = ReturnType<typeof useSearchWorkspace>;
