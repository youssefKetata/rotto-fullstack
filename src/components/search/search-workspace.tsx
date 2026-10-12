"use client";

import { useState } from "react";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { BriefForm } from "./brief-form";
import { CandidateRow } from "./candidate-row";
import {
  FilterSummary,
  removeRequirement,
  requirementLabel,
  requirementExplanation,
} from "./filter-summary";
import type { SearchFilters } from "@/lib/search/schema";
import { WorkspaceOverlays } from "./workspace-overlays";
import { useSearchWorkspace } from "./hooks/use-search-workspace";
import type { WorkspaceIdentity } from "./workspace-state";
import { Icon } from "./icon";
import { PendingLabel } from "./workspace-dialog";
import styles from "./search-workspace.module.css";

export function SearchWorkspace({
  company,
  companyId,
  recruiterId,
}: WorkspaceIdentity & { company?: string }) {
  const workspace = useSearchWorkspace({ companyId, recruiterId });
  const {
    brief: currentBrief,
    setBrief,
    search: completedSearch,
    filters: currentFilters,
    setFilters,
    plan,
    view,
    setView,
    lists,
    listPeople,
    listMemberships,
    activeList,
    savedBriefs,
    candidate,
    setNameAction,
    setDeleteList,
    setEditFilters,
    setUpgrade,
    pending,
    rerunning,
    paging,
    collectionPending,
    pickerPending,
    saving,
    searchSaved,
    planPending,
    ready,
    previousSearchId,
    error,
    setError,
    setDialogError,
    notice,
    retry,
    pageError,
    count,
    adjusted,
    exhausted,
    visible,
    matched,
    currentList,
    savedIds,
    planNote,
    refreshPlan,
    selectList,
    execute,
    startOperation,
    more,
    openPerson,
    openPicker,
    membership,
    saveSearch,
    showLists,
  } = workspace;
  const brief = rerunning?.brief ?? currentBrief;
  const search = rerunning ? null : completedSearch;
  const filters = rerunning?.filters ?? currentFilters;
  const [omitted, setOmitted] = useState<{
    brief: string;
    issues: SearchFilters["issues"];
  }>({ brief: "", issues: [] });
  function updateRequirements(next: SearchFilters) {
    if (search && filters) {
      const removed = filters.issues.filter(
        (issue) =>
          issue.kind === "unsupported" &&
          !next.issues.some(
            (item) =>
              item.text === issue.text && (!issue.required || item.required),
          ),
      );
      setOmitted((previous) => ({
        brief: search.brief,
        issues: [
          ...(previous.brief === search.brief ? previous.issues : []),
          ...removed,
        ].filter(
          (issue, index, all) =>
            all.findIndex((item) => item.text === issue.text) === index,
        ),
      }));
    }
    setFilters(next);
  }
  function continueWithoutRequirement(index: number) {
    if (!filters || pending) return;
    updateRequirements(removeRequirement(filters, index));
    workspace.setNotice(
      `${requirementLabel(filters.issues[index])} removed from requirements. Apply changes to run a new search.`,
    );
  }
  const unchecked =
    omitted.brief === search?.brief
      ? omitted.issues.filter(
          (issue) =>
            !filters?.issues.some(
              (item) => item.text === issue.text && item.required,
            ),
        )
      : [];
  const blocking =
    search?.filters.issues.filter((issue) => issue.required) ?? [];
  const recoveryIndex =
    filters?.issues.findIndex((issue) => issue.required) ?? -1;
  const recovery =
    recoveryIndex >= 0 ? filters?.issues[recoveryIndex] : undefined;
  const resultStatus =
    view === "search" && search
      ? `${search.total} ${search.total === 1 ? "candidate" : "candidates"}.${blocking.length ? ` ${blocking.map((issue) => `${requirementLabel(issue)} ${issue.kind === "unsupported" ? "can't be checked" : "needs review"}`).join(". ")}.` : ""}${unchecked.length ? ` Not checked: ${unchecked.map(requirementLabel).join(", ")}.${adjusted ? " Changes staged; results still use the previous requirements." : ""}` : ""}`
      : "";
  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.brandLink}
          aria-label="Rotto search home"
          onClick={() => setView("search")}
        >
          <Brand />
        </button>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.shortlist}
            data-active={view === "saved"}
            aria-pressed={view === "saved"}
            aria-label={`Saved searches, ${savedBriefs.length}`}
            onClick={() =>
              view === "saved" ? setView("search") : void workspace.showSaved()
            }
            disabled={!ready}
          >
            <Icon name="history" size={18} />
            <span className={styles.headerLabel}>Saved searches</span>
            <span className={styles.badge}>{savedBriefs.length}</span>
          </button>
          <button
            type="button"
            className={styles.shortlist}
            data-active={view === "shortlists"}
            aria-pressed={view === "shortlists"}
            aria-label={`Lists, ${lists.length}`}
            onClick={() =>
              view === "shortlists" ? setView("search") : void showLists()
            }
            disabled={!ready}
          >
            <Icon name="list" size={18} />
            <span className={styles.headerLabel}>Lists</span>
            <span className={styles.badge}>{lists.length}</span>
          </button>
          {company ? (
            <DropdownMenu modal={false}>
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
        {view === "search" && (
          <BriefForm
            brief={brief}
            onChange={company && ready ? setBrief : undefined}
            onSubmit={
              company && ready
                ? () => startOperation("/api/search", { brief: brief.trim() })
                : undefined
            }
            pending={pending}
            compact={!!search || !!rerunning}
            submitted={rerunning?.brief ?? search?.brief}
            planNote={plan?.plan === "paid" || exhausted ? undefined : planNote}
            exhausted={exhausted}
            onUpgrade={() => setUpgrade(true)}
            previousSearchHref={
              ready && previousSearchId
                ? `/?search=${encodeURIComponent(previousSearchId)}`
                : undefined
            }
          />
        )}
        {view === "search" && search && filters && (
          <section
            className={styles.interpretation}
            aria-label="Search requirements"
          >
            <div className={styles.filterHeading}>
              <span>Requirements</span>
              <div className={styles.inlineActions}>
                <button
                  type="button"
                  className={styles.edit}
                  data-edit-requirements
                  disabled={pending}
                  onClick={() => setEditFilters(true)}
                >
                  <Icon name="filter" size={16} />
                  Edit requirements
                </button>
                <button
                  type="button"
                  className={styles.edit}
                  disabled={!ready || pending || saving || searchSaved}
                  onClick={() => void saveSearch()}
                >
                  <Icon name={searchSaved ? "check" : "bookmark"} size={16} />
                  {saving ? "Saving…" : searchSaved ? "Saved" : "Save search"}
                </button>
              </div>
            </div>
            <FilterSummary
              filters={filters}
              disabled={pending}
              onChange={updateRequirements}
              onEdit={() => setEditFilters(true)}
              onRemoveRequirement={continueWithoutRequirement}
            />
            {(filters.anyOf.length > 1 || filters.preferred.length > 0) && (
              <p className={styles.trust}>
                {filters.anyOf.length > 1 &&
                  "Match all requirements in any one accepted set. "}
                {filters.preferred.length > 0 &&
                  "Nice-to-have requirements affect ranking only."}
              </p>
            )}
            {adjusted && (
              <div className={styles.adjusted}>
                <span>
                  Changes staged · Results still use the previous requirements.
                </span>
                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      updateRequirements(structuredClone(search.filters))
                    }
                  >
                    Discard edits
                  </button>
                  <button
                    type="button"
                    className={exhausted ? styles.edit : styles.primaryButton}
                    disabled={pending}
                    onClick={() =>
                      startOperation(
                        `/api/search/${encodeURIComponent(search.search_id)}/rerun`,
                        { filters },
                      )
                    }
                  >
                    {exhausted
                      ? "View plan"
                      : pending
                        ? "Applying…"
                        : "Apply changes"}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
        {view !== "search" && (
          <div className={styles.shortlistHeading}>
            <button
              className={styles.back}
              type="button"
              onClick={() => setView("search")}
            >
              ← Back to search
            </button>
            <div className={styles.collectionHeading}>
              <div>
                <h1>
                  {view === "saved"
                    ? "Saved searches"
                    : "Your team’s shortlists"}
                </h1>
                <p>
                  {view === "saved"
                    ? "View previous results for free. Each rerun counts as a new search."
                    : `People worth a closer look, saved for ${company}.`}
                </p>
              </div>
              {view === "shortlists" && (
                <button
                  className={styles.outlineButton}
                  type="button"
                  onClick={() => {
                    setDialogError("");
                    setNameAction({ kind: "create" });
                  }}
                >
                  Create list
                </button>
              )}
            </div>
          </div>
        )}
        {error && (
          <div className={styles.error} role="alert">
            <p>{error}</p>
            {retry && (
              <button
                type="button"
                disabled={pending}
                onClick={() => void execute(retry)}
              >
                Retry request
              </button>
            )}
            {!plan && (
              <button
                type="button"
                disabled={planPending}
                onClick={() => void refreshPlan()}
              >
                Check plan
              </button>
            )}
            <button type="button" onClick={() => setError("")}>
              Dismiss
            </button>
          </div>
        )}
        {view === "saved" && (
          <section aria-label="Saved searches" aria-busy={pending}>
            {savedBriefs.length > 0 && (
              <ul className={styles.savedList}>
                {savedBriefs.map((saved) => (
                  <li key={saved.id}>
                    <div>
                      <h2>{saved.name || saved.brief}</h2>
                      {saved.name && (
                        <p className={styles.savedBrief}>{saved.brief}</p>
                      )}
                      <div className={styles.savedMeta}>
                        {saved.last_result_count !== null &&
                          saved.last_result_count !== undefined && (
                            <span>
                              {saved.last_result_count.toLocaleString()}{" "}
                              {saved.last_result_count === 1
                                ? "candidate"
                                : "candidates"}
                            </span>
                          )}
                        {(saved.last_searched_at || saved.created_at) && (
                          <span>
                            {saved.last_searched_at ? "Last run " : "Saved "}
                            <time
                              dateTime={
                                saved.last_searched_at || saved.created_at
                              }
                            >
                              {new Date(
                                (saved.last_searched_at || saved.created_at)!,
                              ).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </time>
                          </span>
                        )}
                        {saved.filters.anyOf.length > 1 && (
                          <span>
                            Matches any of {saved.filters.anyOf.length}{" "}
                            requirement groups
                          </span>
                        )}
                        {saved.filters.issues.length > 0 && (
                          <span>
                            {saved.filters.issues.length}{" "}
                            {saved.filters.issues.length === 1
                              ? "requirement"
                              : "requirements"}{" "}
                            to review
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={styles.savedActions}>
                      {saved.last_search_id && (
                        <a
                          className={styles.viewResults}
                          href={`/?search=${encodeURIComponent(saved.last_search_id)}`}
                        >
                          View results
                        </a>
                      )}
                      <button
                        className={styles.rerunButton}
                        type="button"
                        disabled={pending}
                        aria-busy={rerunning?.id === saved.id}
                        onClick={() =>
                          startOperation(
                            `/api/saved-briefs/${encodeURIComponent(saved.id)}/rerun`,
                            {},
                          )
                        }
                      >
                        <PendingLabel
                          pending={rerunning?.id === saved.id}
                          idle={exhausted ? "Paid plan" : "Rerun"}
                          loading="Searching…"
                        />
                        <span className={styles.rerunIcon} aria-hidden="true">
                          {rerunning?.id === saved.id ? (
                            <span
                              className={styles.spinner}
                              aria-hidden="true"
                            />
                          ) : exhausted ? (
                            <Icon name="lock" size={14} />
                          ) : null}
                        </span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className={styles.savedOverflow}
                            type="button"
                            aria-label={`Manage saved search: ${saved.name || saved.brief}`}
                            disabled={pending || workspace.savedPending}
                          >
                            <Icon name="more" size={18} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              workspace.setSavedError("");
                              workspace.setSavedName(saved);
                            }}
                          >
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              workspace.setSavedError("");
                              workspace.setSavedRemoval(saved);
                            }}
                          >
                            Remove saved search
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!savedBriefs.length && (
              <div className={styles.empty}>
                <h3>A good search is worth keeping.</h3>
                <p>
                  Choose Save search above the results to return to its brief
                  and requirements later.
                </p>
                <button type="button" onClick={() => setView("search")}>
                  Back to search
                </button>
              </div>
            )}
          </section>
        )}
        {view === "shortlists" && (
          <div className={styles.listToolbar}>
            {lists.length === 1 ? (
              <h2 className={styles.singleListHeading}>{lists[0].name}</h2>
            ) : (
              <div
                className={styles.listTabs}
                role="group"
                aria-label="Choose shortlist"
              >
                {lists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    data-active={activeList === list.id}
                    disabled={collectionPending}
                    onClick={() => void selectList(list.id)}
                  >
                    {list.name}
                    {listPeople[list.id] && (
                      <span>{listPeople[list.id].length}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {currentList && (
              <div className={styles.inlineActions}>
                <button
                  className={styles.edit}
                  type="button"
                  onClick={() => {
                    setDialogError("");
                    setNameAction({ kind: "rename", list: currentList });
                  }}
                >
                  Rename
                </button>
                <button
                  className={styles.deleteList}
                  type="button"
                  onClick={() => {
                    setDialogError("");
                    setDeleteList(currentList);
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
        {((view === "search" && (search || pending)) ||
          view === "shortlists") && (
          <section
            className={styles.results}
            aria-label={
              view === "shortlists" ? "Shortlist candidates" : "Search results"
            }
            aria-busy={pending || collectionPending}
          >
            <div className={styles.resultHeading}>
              <div className={styles.resultCount}>
                <h2
                  tabIndex={-1}
                  ref={count}
                  aria-label={resultStatus || undefined}
                >
                  {pending
                    ? "Finding candidates…"
                    : view === "shortlists"
                      ? `${visible.length} shortlisted`
                      : `${search?.total.toLocaleString() ?? 0} ${search?.total === 1 ? "candidate" : "candidates"}`}
                </h2>
                {view === "search" && unchecked.length > 0 && (
                  <p className={styles.notChecked}>
                    Not checked: {unchecked.map(requirementLabel).join(", ")}
                    {adjusted && " · Changes staged"}
                  </p>
                )}
              </div>
              {view === "search" && search && search.total > 0 && !pending && (
                <span className={styles.rankNote}>
                  {adjusted ? "Previous requirements · " : ""}
                  {search.filters.preferred.length
                    ? "Most nice-to-have requirements matched first, then years of experience"
                    : "Most years of experience first"}
                </span>
              )}
            </div>
            {(pending && !search) ||
            (collectionPending && view === "shortlists") ? (
              <div className={styles.skeletons} aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <div className={styles.skeleton} key={index}>
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
                {visible.length > 0 && (
                  <ul className={styles.list}>
                    {visible.map((person) => (
                      <CandidateRow
                        key={person.id}
                        candidate={person}
                        matched={view === "shortlists" ? [] : matched}
                        workRequirements={
                          view === "search"
                            ? [
                                ...(search?.filters.anyOf ?? []),
                                ...(search?.filters.preferred ?? []),
                              ].flatMap((criteria) => criteria.experience ?? [])
                            : undefined
                        }
                        selected={candidate?.id === person.id}
                        saved={savedIds.has(person.id)}
                        remove={view === "shortlists"}
                        membershipPending={pickerPending}
                        membership={
                          view === "shortlists"
                            ? listMemberships[activeList ?? ""]?.find(
                                (entry) => entry.candidate_id === person.id,
                              )
                            : undefined
                        }
                        recruiterId={recruiterId}
                        onOpen={(person) => void openPerson(person)}
                        onToggle={(person) =>
                          view === "shortlists" && currentList
                            ? void membership(currentList, person, true)
                            : void openPicker(person)
                        }
                      />
                    ))}
                  </ul>
                )}
                {!visible.length && !pending && (
                  <div className={styles.empty}>
                    <span className={styles.emptyIcon}>
                      <Icon
                        name={view === "shortlists" ? "bookmark" : "search"}
                        size={26}
                      />
                    </span>
                    <h3>
                      {view === "shortlists"
                        ? lists.length
                          ? `No candidates in “${currentList?.name ?? "this list"}”`
                          : "Start with a named list."
                        : "No candidates match every requirement"}
                    </h3>
                    <p>
                      {view === "shortlists"
                        ? "Shortlist a candidate from the results or their profile. Your team can return to them here."
                        : blocking.length
                          ? blocking
                              .map(
                                (issue) =>
                                  `${requirementLabel(issue)} ${issue.kind === "unsupported" ? "can't be checked" : "needs review"}. ${requirementExplanation(issue)}`,
                              )
                              .join(" ")
                          : "Try changing a requirement to broaden your next search."}
                    </p>
                    {view === "search" && (
                      <>
                        {recovery && (
                          <button
                            type="button"
                            className={styles.primaryButton}
                            disabled={pending}
                            onClick={() =>
                              continueWithoutRequirement(recoveryIndex)
                            }
                          >
                            Continue without {requirementLabel(recovery)}
                            <Icon name="arrow" size={16} />
                          </button>
                        )}
                        {adjusted && !recovery && (
                          <p>
                            Requirement changes are staged. Apply changes above
                            to run a new search.
                          </p>
                        )}
                        <button
                          type="button"
                          className={styles.emptyEdit}
                          disabled={pending}
                          onClick={() => setEditFilters(true)}
                        >
                          Edit requirements
                        </button>
                      </>
                    )}
                    {view === "shortlists" && (
                      <button
                        type="button"
                        onClick={() =>
                          lists.length
                            ? setView("search")
                            : setNameAction({ kind: "create" })
                        }
                      >
                        {lists.length ? "Back to search" : "Create a list"}
                      </button>
                    )}
                  </div>
                )}
                {view === "search" &&
                  search &&
                  search.total > 20 &&
                  !!search.results.length && (
                    <div className={styles.pagination}>
                      <span>
                        {search.results.length} of{" "}
                        {search.total.toLocaleString()} shown
                      </span>
                      {search.results.length < search.total && (
                        <button
                          type="button"
                          disabled={paging || pending}
                          onClick={() => void more()}
                        >
                          {paging
                            ? "Loading more…"
                            : pageError
                              ? "Retry next page"
                              : "Show more"}
                          <Icon name="arrow" size={16} />
                        </button>
                      )}
                    </div>
                  )}
                {pageError && view === "search" && (
                  <p className={styles.dialogError} role="alert">
                    {pageError} Your loaded results are still here.
                  </p>
                )}
              </>
            )}
          </section>
        )}
        {exhausted && search && view === "search" && !pending && (
          <div className={styles.planBanner}>
            <span>
              {company
                ? `${company}'s free search is used.`
                : "Your company's free search is used."}
            </span>
            <button type="button" onClick={() => setUpgrade(true)}>
              Plan
            </button>
          </div>
        )}
      </div>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {pending
          ? "Finding candidates…"
          : /^\d+ candidates? found\.$/.test(notice)
            ? resultStatus
            : `${notice} ${resultStatus}`.trim()}
      </span>
      <WorkspaceOverlays
        workspace={workspace}
        onRequirementsChange={updateRequirements}
      />
    </main>
  );
}
