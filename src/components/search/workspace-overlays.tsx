"use client";

import { CandidateDrawer } from "./candidate-drawer";
import { FilterEditor } from "./filter-editor";
import {
  NameDialog,
  PendingLabel,
  UpgradeDialog,
  WorkspaceDialog,
} from "./workspace-dialog";
import { Icon } from "./icon";
import type { WorkspaceModel } from "./hooks/use-search-workspace";
import type { SearchFilters } from "@/lib/search/schema";
import styles from "./search-workspace.module.css";

export function WorkspaceOverlays({
  workspace,
  onRequirementsChange,
}: {
  workspace: WorkspaceModel;
  onRequirementsChange: (filters: SearchFilters) => void;
}) {
  const {
    editFilters,
    filters,
    setEditFilters,
    candidate,
    matched,
    savedIds,
    closePerson,
    profilePeople,
    openPerson,
    refreshMemberships,
    currentList,
    view,
    picker,
    pickerPending,
    setPicker,
    lists,
    listPeople,
    membership,
    dialogError,
    setDialogError,
    setNameAction,
    nameAction,
    collectionPending,
    saveName,
    deleteList,
    setDeleteList,
    removeList,
    upgrade,
    setUpgrade,
    refreshPlan,
    planPending,
    search,
    startOperation,
  } = workspace;
  return (
    <>
      {workspace.savedName && (
        <NameDialog
          key={workspace.savedName.id}
          title="Rename saved search"
          searchName
          initial={
            workspace.savedName.name || workspace.savedName.brief.slice(0, 100)
          }
          pending={workspace.savedPending}
          error={workspace.savedError}
          onSave={(name) => void workspace.editSaved(name)}
          onClose={() => {
            if (!workspace.savedPending) workspace.setSavedName(null);
          }}
        />
      )}
      {workspace.savedRemoval && (
        <WorkspaceDialog
          title="Remove saved search?"
          description="Previous results remain available. This removes the saved brief from your team’s collection."
          onClose={() => {
            if (!workspace.savedPending) workspace.setSavedRemoval(null);
          }}
        >
          <div className={styles.upgradeContent}>
            <p>{workspace.savedRemoval.name || workspace.savedRemoval.brief}</p>
            {workspace.savedError && (
              <p role="alert" className={styles.dialogError}>
                {workspace.savedError}
              </p>
            )}
            <footer>
              <button
                type="button"
                disabled={workspace.savedPending}
                onClick={() => workspace.setSavedRemoval(null)}
              >
                Keep search
              </button>
              <button
                className={styles.dangerButton}
                type="button"
                disabled={workspace.savedPending}
                onClick={() => void workspace.editSaved()}
              >
                <PendingLabel
                  pending={workspace.savedPending}
                  idle="Remove saved search"
                  loading="Removing…"
                />
              </button>
            </footer>
          </div>
        </WorkspaceDialog>
      )}
      {editFilters && filters && (
        <FilterEditor
          filters={filters}
          onClose={() => setEditFilters(false)}
          onApply={(next) => {
            onRequirementsChange(next);
            setEditFilters(false);
            if (search) {
              startOperation(
                `/api/search/${encodeURIComponent(search.search_id)}/rerun`,
                { filters: next },
              );
            }
          }}
        />
      )}
      {candidate && (
        <CandidateDrawer
          candidate={candidate}
          matched={matched}
          saved={savedIds.has(candidate.id)}
          onClose={closePerson}
          lists={lists}
          memberListIds={lists
            .filter((list) =>
              listPeople[list.id]?.some((person) => person.id === candidate.id),
            )
            .map((list) => list.id)}
          currentList={view === "shortlists" ? currentList : undefined}
          membershipPending={pickerPending}
          membershipError={dialogError}
          onRefreshMemberships={() => void refreshMemberships()}
          onMembership={(list, person, remove) =>
            void membership(list, person, remove)
          }
          onCreateList={() => {
            setDialogError("");
            setNameAction({ kind: "create" });
          }}
          position={profilePeople.findIndex(
            (person) => person.id === candidate.id,
          )}
          total={profilePeople.length}
          onStep={(direction) => {
            const index = profilePeople.findIndex(
              (person) => person.id === candidate.id,
            );
            const next = profilePeople[index + direction];
            if (next) void openPerson(next);
          }}
        />
      )}
      {picker && (
        <WorkspaceDialog
          title={`Shortlist ${picker.full_name.split(" ")[0]}.`}
          description={
            <PendingLabel
              pending={pickerPending}
              idle="Choose the named lists where this candidate belongs."
              loading="Updating lists…"
            />
          }
          onClose={() => {
            if (!pickerPending) setPicker(null);
          }}
        >
          <div className={styles.pickerLists} aria-busy={pickerPending}>
            {lists.map((list) => {
              const saved =
                listPeople[list.id]?.some(
                  (person) => person.id === picker.id,
                ) ?? false;
              return (
                <button
                  key={list.id}
                  type="button"
                  data-saved={saved}
                  disabled={pickerPending}
                  aria-pressed={saved}
                  onClick={() => void membership(list, picker, saved)}
                >
                  <span>
                    <strong>{list.name}</strong>
                    <small>
                      {listPeople[list.id]?.length ?? 0}{" "}
                      {(listPeople[list.id]?.length ?? 0) === 1
                        ? "person"
                        : "people"}
                    </small>
                  </span>
                  <Icon name={saved ? "check" : "bookmark"} size={18} />
                </button>
              );
            })}
            {!lists.length && (
              <p className={styles.trust}>
                Create your first list, then add this candidate.
              </p>
            )}
            {dialogError && (
              <p className={styles.dialogError} role="alert">
                {dialogError}
              </p>
            )}
            <button
              className={styles.addList}
              type="button"
              disabled={pickerPending}
              onClick={() => {
                setDialogError("");
                setNameAction({ kind: "create" });
              }}
            >
              + Create a list
            </button>
          </div>
        </WorkspaceDialog>
      )}
      {nameAction && (
        <NameDialog
          key={nameAction.kind === "rename" ? nameAction.list.id : "create"}
          title={
            nameAction.kind === "create"
              ? "Create a shortlist."
              : "Rename this list."
          }
          initial={nameAction.kind === "rename" ? nameAction.list.name : ""}
          pending={collectionPending}
          error={dialogError}
          onSave={(name) => void saveName(name)}
          onClose={() => {
            if (!collectionPending) setNameAction(null);
          }}
        />
      )}
      {deleteList && (
        <WorkspaceDialog
          title={`Delete “${deleteList.name}” and its ${listPeople[deleteList.id]?.length ?? 0} ${(listPeople[deleteList.id]?.length ?? 0) === 1 ? "person" : "people"}?`}
          description="This removes the list and its memberships. Candidate profiles remain available."
          onClose={() => {
            if (!collectionPending) setDeleteList(null);
          }}
        >
          <div className={styles.upgradeContent}>
            {dialogError && (
              <p className={styles.dialogError} role="alert">
                {dialogError}
              </p>
            )}
            <footer>
              <button
                type="button"
                disabled={collectionPending}
                onClick={() => setDeleteList(null)}
              >
                Keep list
              </button>
              <button
                className={styles.dangerButton}
                type="button"
                disabled={collectionPending}
                onClick={() => void removeList()}
              >
                {collectionPending ? "Deleting…" : "Delete list"}
              </button>
            </footer>
          </div>
        </WorkspaceDialog>
      )}
      {upgrade && (
        <UpgradeDialog
          onClose={() => setUpgrade(false)}
          onRefresh={async () => (await refreshPlan())?.plan ?? null}
          refreshing={planPending}
        />
      )}
    </>
  );
}
