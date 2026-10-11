"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  filterChips,
  previewBrief,
  validateFilters,
} from "@/lib/search/filters";
import type {
  Candidate,
  Filters,
  SearchResult,
  Sort,
} from "@/lib/search/types";
import { BriefForm } from "./brief-form";
import { CandidateRow } from "./candidate-row";
import { CandidateDrawer } from "./candidate-drawer";
import { FilterEditor } from "./filter-editor";
import { Icon } from "./icon";
import styles from "./search-workspace.module.css";

type Snapshot = {
  brief: string;
  submitted: string;
  filters: Filters;
  original: Filters;
  unsupported: string[];
  results: Candidate[];
  total: number;
  page: number;
  sort: Sort;
  shortlist: Candidate[];
  error: string;
};

export function SearchWorkspace({
  company,
  companyId,
  recruiterId,
}: {
  company?: string;
  companyId?: string;
  recruiterId?: string;
}) {
  const [brief, setBrief] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [filters, setFilters] = useState<Filters>({ skills: [] });
  const [original, setOriginal] = useState<Filters>({ skills: [] });
  const [unsupported, setUnsupported] = useState<string[]>([]);
  const [results, setResults] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>("availability");
  const [pending, setPending] = useState(false);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState("");
  const [retryPage, setRetryPage] = useState(1);
  const [storageError, setStorageError] = useState("");
  const [shortlist, setShortlist] = useState<Candidate[]>([]);
  const [shortlistView, setShortlistView] = useState(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [editFilters, setEditFilters] = useState(false);
  const [notice, setNotice] = useState("");
  const [restored, setRestored] = useState(false);
  const request = useRef<AbortController | null>(null);
  const count = useRef<HTMLHeadingElement>(null);
  const searchScroll = useRef(0);
  const key =
    companyId && recruiterId
      ? `rotto-preview-v1:${companyId}:${recruiterId}`
      : null;
  const adjusted = JSON.stringify(filters) !== JSON.stringify(original);
  const visible = shortlistView ? shortlist : results;

  useEffect(() => {
    if (!key) return;
    let active = true;
    const controller = new AbortController();
    // Read browser-only persistence after hydration; never submit a search.
    async function restore() {
      await Promise.resolve();
      try {
        const saved = sessionStorage.getItem(key!);
        if (saved && active) {
          const snapshot = JSON.parse(saved) as Snapshot;
          const savedFilters = validateFilters(snapshot.filters);
          const savedOriginal = validateFilters(snapshot.original);
          if (
            savedFilters &&
            savedOriginal &&
            Array.isArray(snapshot.results) &&
            Array.isArray(snapshot.shortlist)
          ) {
            setBrief(snapshot.brief);
            setSubmitted(snapshot.submitted);
            setFilters(savedFilters);
            setOriginal(savedOriginal);
            setUnsupported(snapshot.unsupported);
            setResults(snapshot.results);
            setTotal(snapshot.total);
            setPage(snapshot.page);
            setSort(snapshot.sort);
            setShortlist(snapshot.shortlist);
            setError(snapshot.error ?? "");
          }
        }
      } catch {
        if (active)
          setStorageError(
            "This browser couldn't restore your preview. You can still search.",
          );
      }
      if (active) setRestored(true);
    }
    async function openLink() {
      const id = new URL(window.location.href).searchParams.get("candidate");
      if (!id) {
        if (active) setCandidate(null);
        return;
      }
      try {
        const response = await fetch(
          `/api/preview/candidates/${encodeURIComponent(id)}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (active) setCandidate(data);
      } catch (cause) {
        if (active && !controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Couldn't open candidate.",
          );
      }
    }
    void restore();
    void openLink();
    window.addEventListener("popstate", openLink);
    return () => {
      active = false;
      controller.abort();
      request.current?.abort();
      window.removeEventListener("popstate", openLink);
    };
  }, [key]);

  useEffect(() => {
    if (!key || !restored || pending) return;
    try {
      const snapshot: Snapshot = {
        brief,
        submitted,
        filters,
        original,
        unsupported,
        results,
        total,
        page,
        sort,
        shortlist,
        error,
      };
      sessionStorage.setItem(key, JSON.stringify(snapshot));
    } catch {
      // Storage can be disabled or full; local UI remains usable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageError(
        "Browser storage is unavailable. This preview won't survive a reload.",
      );
    }
  }, [
    key,
    restored,
    brief,
    submitted,
    filters,
    original,
    unsupported,
    results,
    total,
    page,
    sort,
    shortlist,
    error,
    pending,
  ]);

  async function load(
    nextFilters: Filters,
    nextSort: Sort = sort,
    nextPage = 1,
  ) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setRetryPage(nextPage);
    setPending(true);
    setPaging(nextPage > 1);
    if (nextPage === 1) {
      setResults([]);
      setTotal(0);
      setPage(1);
    }
    if (!filterChips(nextFilters).length) {
      setError("Add at least one filter to find candidates.");
      setPending(false);
      return;
    }
    try {
      const response = await fetch("/api/preview/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: nextFilters,
          sort: nextSort,
          page: nextPage,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Couldn't load candidates.");
      const result = data as SearchResult;
      setResults((previous) =>
        nextPage > 1 ? [...previous, ...result.results] : result.results,
      );
      setTotal(result.total);
      setPage(nextPage);
      setNotice(
        nextPage > 1
          ? `${Math.min(nextPage * 20, result.total)} of ${result.total} candidates shown.`
          : `${result.total} ${result.total === 1 ? "candidate" : "candidates"} found.`,
      );
      if (nextPage === 1)
        requestAnimationFrame(() =>
          count.current?.focus({ preventScroll: true }),
        );
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Couldn't connect. Please try again.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
        setPaging(false);
      }
    }
  }

  function submit() {
    const text = brief.trim();
    if (pending || !text || text === submitted) return;
    const interpreted = previewBrief(text);
    setSubmitted(text);
    setFilters(interpreted.filters);
    setOriginal(interpreted.filters);
    setUnsupported(interpreted.unsupported);
    setShortlistView(false);
    void load(interpreted.filters);
  }
  function refine(next: Filters) {
    setFilters(next);
    setEditFilters(false);
    void load(next);
  }
  function remove(key: keyof Filters, skill?: string) {
    const next = { ...filters };
    if (skill) next.skills = next.skills.filter((s) => s !== skill);
    else delete next[key];
    refine(next);
  }
  function toggle(person: Candidate) {
    const saved = shortlist.some((c) => c.id === person.id);
    setShortlist((previous) =>
      saved
        ? previous.filter((c) => c.id !== person.id)
        : [...previous, person],
    );
    setNotice(
      `${person.full_name} ${saved ? "removed from" : "added to"} your tab-local shortlist.`,
    );
  }
  function showShortlist(show: boolean) {
    if (show) searchScroll.current = window.scrollY;
    setShortlistView(show);
    requestAnimationFrame(() =>
      window.scrollTo({ top: show ? 0 : searchScroll.current }),
    );
  }
  function linkCandidate(person: Candidate | null) {
    setCandidate(person);
    const url = new URL(window.location.href);
    if (person) url.searchParams.set("candidate", person.id);
    else url.searchParams.delete("candidate");
    window.history.replaceState(window.history.state, "", url);
  }
  function startOver() {
    request.current?.abort();
    setPending(false);
    setPaging(false);
    setBrief("");
    setSubmitted("");
    setFilters({ skills: [] });
    setOriginal({ skills: [] });
    setResults([]);
    setTotal(0);
    setUnsupported([]);
    setError("");
    setShortlistView(false);
    requestAnimationFrame(() =>
      document.getElementById("candidate-brief")?.focus(),
    );
  }

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <Link href="/" className={styles.brandLink} aria-label="Rotto home">
          <Brand />
        </Link>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.shortlist}
            data-active={shortlistView}
            aria-pressed={shortlistView}
            onClick={() => showShortlist(!shortlistView)}
            disabled={!company}
          >
            <Icon name="bookmark" size={18} />
            <span>Shortlist</span>
            <span className={styles.badge}>{shortlist.length}</span>
          </button>
          {company ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={styles.account}
                  aria-label={`${company} account`}
                >
                  <span className={styles.initial}>{company.charAt(0)}</span>
                  <span className={styles.company}>{company}</span>
                  <Icon name="chevron" size={15} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className={styles.accountPanel} align="end">
                <DropdownMenuLabel>
                  <strong>{company}</strong>
                  <p>Recruiter workspace</p>
                </DropdownMenuLabel>
                <LogoutButton menuItem />
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className={styles.accountPending} role="status">
              Opening workspace…
            </span>
          )}
        </div>
      </header>
      <div className={styles.body}>
        {!shortlistView && (
          <BriefForm
            brief={brief}
            onChange={company && restored ? setBrief : undefined}
            onSubmit={company && restored ? submit : undefined}
            pending={pending}
            compact={!!submitted}
            submitted={submitted}
            onReset={startOver}
          />
        )}
        {shortlistView ? (
          <div className={styles.shortlistHeading}>
            <button
              className={styles.back}
              type="button"
              onClick={() => showShortlist(false)}
            >
              ← Back to search
            </button>
            <h1>Your shortlist.</h1>
            <p>
              A few people worth a closer look. Saved in this tab for {company}.
            </p>
          </div>
        ) : (
          submitted && (
            <section
              className={styles.interpretation}
              aria-label="Search filters"
            >
              <div className={styles.filterHeading}>
                <span>
                  Understood as{" "}
                  <span className={styles.preview}>· keyword preview</span>
                </span>
                <button
                  className={styles.edit}
                  type="button"
                  onClick={() => setEditFilters(true)}
                  disabled={pending}
                >
                  <Icon name="filter" size={16} />
                  Edit filters
                </button>
              </div>
              <div className={styles.chips}>
                {filterChips(filters).map((chip) => (
                  <div
                    className={styles.chip}
                    key={`${chip.key}:${chip.label}`}
                  >
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setEditFilters(true)}
                      aria-label={`Edit filter: ${chip.label}`}
                    >
                      {chip.label}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(chip.key, chip.skill)}
                      aria-label={`Remove filter: ${chip.label}`}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <p className={styles.trust}>
                Only these filters are applied. All selected skills are
                required. Other wording is not interpreted in this preview.
              </p>
              {unsupported.length > 0 && (
                <p className={styles.unsupported}>
                  Not interpreted: {unsupported.join(", ")}. Review the filters
                  above.
                </p>
              )}
              {adjusted && (
                <div className={styles.adjusted}>
                  Filters adjusted
                  <button
                    type="button"
                    onClick={() => refine(original)}
                    disabled={pending}
                  >
                    Reset to original
                  </button>
                </div>
              )}
            </section>
          )
        )}
        {(submitted || shortlistView) && (
          <section
            className={styles.results}
            aria-label={shortlistView ? "Shortlist" : "Search results"}
            aria-busy={pending && !shortlistView}
          >
            <div className={styles.resultHeading}>
              <h2 tabIndex={-1} ref={count}>
                {shortlistView
                  ? `${shortlist.length} shortlisted`
                  : pending && !paging
                    ? "Finding candidates…"
                    : error && !results.length
                      ? "Search needs attention"
                      : `${total.toLocaleString()} ${total === 1 ? "candidate" : "candidates"}`}
              </h2>
              {!shortlistView && (
                <div className={styles.sort}>
                  <label htmlFor="candidate-sort">Sort by</label>
                  <Select
                    value={sort}
                    disabled={pending}
                    onValueChange={(value: Sort) => {
                      setSort(value);
                      void load(filters, value);
                    }}
                  >
                    <SelectTrigger
                      id="candidate-sort"
                      className={styles.sortTrigger}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="availability">
                        Open to work, then experience
                      </SelectItem>
                      <SelectItem value="experience">Experience</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {error && !shortlistView && (
              <div className={styles.error} role="alert">
                <p>{error}</p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void load(filters, sort, retryPage)}
                >
                  Try again
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setEditFilters(true)}
                >
                  Edit filters
                </button>
              </div>
            )}
            {pending && !paging && !shortlistView ? (
              <div className={styles.skeletons} aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <div className={styles.skeleton} key={i}>
                    <span />
                    <div>
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <ul className={styles.list}>
                  {visible.map((person) => (
                    <CandidateRow
                      key={person.id}
                      candidate={person}
                      matched={filters.skills}
                      selected={candidate?.id === person.id}
                      saved={shortlist.some((c) => c.id === person.id)}
                      onOpen={linkCandidate}
                      onToggle={toggle}
                    />
                  ))}
                </ul>
                {!visible.length && !error && (
                  <div className={styles.empty}>
                    <span className={styles.emptyIcon}>
                      <Icon
                        name={shortlistView ? "bookmark" : "search"}
                        size={26}
                      />
                    </span>
                    <h3>
                      {shortlistView
                        ? "Keep the people who stand out."
                        : "No one matches every detail."}
                    </h3>
                    <p>
                      {shortlistView
                        ? "Shortlist a candidate from the results or their profile. They'll appear here."
                        : "Try removing a skill or broadening the location. Your brief stays right here."}
                    </p>
                    {shortlistView ? (
                      <button
                        type="button"
                        onClick={() => showShortlist(false)}
                      >
                        Back to search
                        <Icon name="arrow" size={17} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditFilters(true)}
                      >
                        Adjust filters
                        <Icon name="filter" size={17} />
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            {!shortlistView && results.length > 0 && (
              <div className={styles.pagination}>
                <span>
                  Showing {results.length} of {total.toLocaleString()}
                </span>
                {results.length < total && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void load(filters, sort, page + 1)}
                  >
                    {paging ? "Loading candidates…" : "Show 20 more"}
                    <Icon name="chevron" size={16} />
                  </button>
                )}
              </div>
            )}
          </section>
        )}
        {storageError && (
          <p className={styles.storageError} role="alert">
            {storageError}
          </p>
        )}
        {error && !submitted && (
          <p className={styles.storageError} role="alert">
            {error}
          </p>
        )}
      </div>
      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {notice}
      </p>
      {candidate && (
        <CandidateDrawer
          candidate={candidate}
          matched={filters.skills}
          saved={shortlist.some((c) => c.id === candidate.id)}
          onClose={() => linkCandidate(null)}
          onToggle={toggle}
          position={visible.findIndex((c) => c.id === candidate.id)}
          total={visible.length}
          onStep={(direction) => {
            const index = visible.findIndex((c) => c.id === candidate.id);
            if (index >= 0 && visible[index + direction])
              linkCandidate(visible[index + direction]);
          }}
        />
      )}
      {editFilters && (
        <FilterEditor
          filters={filters}
          onClose={() => setEditFilters(false)}
          onApply={refine}
        />
      )}
    </main>
  );
}
