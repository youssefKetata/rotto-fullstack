"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { searchApi } from "@/lib/search/browser";
import type {
  Shortlist,
  ShortlistDetail,
  ShortlistMembership,
} from "@/lib/search/contracts";
import type { Candidate } from "@/lib/search/types";
import { errorMessage as message, type NameAction } from "../workspace-state";

type Options = {
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
};

/** Owns list loading, membership, and list editing; search quota is unrelated. */
export function useShortlists({ setError, setNotice }: Options) {
  const [lists, setLists] = useState<Shortlist[]>([]);
  const [listPeople, setListPeople] = useState<Record<string, Candidate[]>>({});
  const [listMemberships, setListMemberships] = useState<
    Record<string, ShortlistMembership[]>
  >({});
  const [activeList, setActiveList] = useState<string | null>(null);
  const [picker, setPicker] = useState<Candidate | null>(null);
  const [nameAction, setNameAction] = useState<NameAction | null>(null);
  const [deleteList, setDeleteList] = useState<Shortlist | null>(null);
  const [collectionPending, setCollectionPending] = useState(false);
  const [pickerPending, setPickerPending] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const mutationBusy = useRef(false);
  const loadList = useCallback(async (id: string, signal?: AbortSignal) => {
    const data = await searchApi<ShortlistDetail>(
      `/api/shortlists/${encodeURIComponent(id)}`,
      { signal },
    );
    if (!signal?.aborted) {
      setListPeople((previous) => ({ ...previous, [id]: data.people }));
      setListMemberships((previous) => ({
        ...previous,
        [id]: data.memberships,
      }));
    }
    return data.people;
  }, []);

  async function refreshMemberships() {
    setPickerPending(true);
    setDialogError("");
    try {
      await Promise.all(lists.map((list) => loadList(list.id)));
    } catch (cause) {
      setDialogError(message(cause));
    } finally {
      setPickerPending(false);
    }
  }
  async function openPicker(person: Candidate) {
    setPicker(person);
    await refreshMemberships();
  }

  // Serialize membership changes so Undo can wait for an in-flight removal.
  const membershipQueue = useRef<Promise<void>>(Promise.resolve());
  function enqueueMembership(action: () => Promise<void>) {
    const next = membershipQueue.current.then(action);
    membershipQueue.current = next.catch(() => {});
    return next;
  }
  function restoreRow(listId: string, person: Candidate, index: number) {
    setListPeople((previous) => {
      const people = previous[listId] ?? [];
      if (people.some((item) => item.id === person.id)) return previous;
      const restored = [...people];
      restored.splice(Math.max(0, Math.min(index, restored.length)), 0, person);
      return { ...previous, [listId]: restored };
    });
  }
  function undoRemoval(
    list: Shortlist,
    person: Candidate,
    index: number,
    addedAt: string,
    toastId: string | number,
  ) {
    toast.loading("Restoring candidate…", { id: toastId, action: null });
    return enqueueMembership(async () => {
      setPickerPending(true);
      try {
        await searchApi(
          `/api/shortlists/${encodeURIComponent(list.id)}/people/${encodeURIComponent(person.id)}`,
          {
            method: "POST",
            body: JSON.stringify({ restoreAddedAt: addedAt }),
          },
        );
        restoreRow(list.id, person, index);
        // The server's stable order also handles a teammate re-adding the person.
        await loadList(list.id);
        toast.dismiss(toastId);
        setNotice(`${person.full_name} restored to ${list.name}.`);
      } catch (cause) {
        toast.error(message(cause), {
          id: toastId,
          duration: 6000,
          action: {
            label: "Retry",
            onClick: (event) => {
              event.preventDefault();
              void undoRemoval(list, person, index, addedAt, toastId);
            },
          },
        });
      } finally {
        setPickerPending(false);
      }
    });
  }
  function membership(list: Shortlist, person: Candidate, remove: boolean) {
    return enqueueMembership(async () => {
      setPickerPending(true);
      setDialogError("");
      const originalIndex = (listPeople[list.id] ?? []).findIndex(
        (item) => item.id === person.id,
      );
      if (remove)
        setListPeople((previous) => ({
          ...previous,
          [list.id]: (previous[list.id] ?? []).filter(
            (item) => item.id !== person.id,
          ),
        }));
      try {
        const result = await searchApi<{
          membership?: { added_at: string } | null;
        }>(
          `/api/shortlists/${encodeURIComponent(list.id)}/people/${encodeURIComponent(person.id)}`,
          { method: remove ? "DELETE" : "POST" },
        );
        if (remove && result.membership) {
          const addedAt = result.membership.added_at;
          const toastId = toast(
            `Removed ${person.full_name.split(" ")[0]} from ${list.name}.`,
            {
              duration: 6000,
              action: {
                label: "Undo",
                onClick: (event) => {
                  event.preventDefault();
                  void undoRemoval(
                    list,
                    person,
                    originalIndex,
                    addedAt,
                    toastId,
                  );
                },
              },
            },
          );
        } else if (!remove) {
          await loadList(list.id);
        }
        // Adds are announced to assistive technology, without a visual toast.
        setNotice(
          `${person.full_name} ${remove ? "removed from" : "added to"} ${list.name}.`,
        );
      } catch (cause) {
        if (remove && originalIndex >= 0)
          restoreRow(list.id, person, originalIndex);
        toast.error(message(cause));
        if (picker) setDialogError(message(cause));
      } finally {
        setPickerPending(false);
      }
    });
  }
  async function saveName(name: string) {
    if (!nameAction || mutationBusy.current) return;
    mutationBusy.current = true;
    setCollectionPending(true);
    setDialogError("");
    try {
      if (nameAction.kind === "create") {
        const created = await searchApi<{ id: string }>("/api/shortlists", {
          method: "POST",
          body: JSON.stringify({ name }),
        });
        setLists((previous) => [...previous, { id: created.id, name }]);
        setListPeople((previous) => ({ ...previous, [created.id]: [] }));
        setActiveList(created.id);
        setNotice(`${name} created.`);
      } else {
        await searchApi(
          `/api/shortlists/${encodeURIComponent(nameAction.list.id)}`,
          { method: "PATCH", body: JSON.stringify({ name }) },
        );
        setLists((previous) =>
          previous.map((list) =>
            list.id === nameAction.list.id ? { ...list, name } : list,
          ),
        );
        setNotice(`List renamed to ${name}.`);
      }
      setNameAction(null);
    } catch (cause) {
      setDialogError(message(cause));
    } finally {
      mutationBusy.current = false;
      setCollectionPending(false);
    }
  }

  async function removeList() {
    if (!deleteList || mutationBusy.current) return;
    mutationBusy.current = true;
    setCollectionPending(true);
    setDialogError("");
    try {
      await searchApi(`/api/shortlists/${encodeURIComponent(deleteList.id)}`, {
        method: "DELETE",
      });
      const remaining = lists.filter((list) => list.id !== deleteList.id);
      setLists(remaining);
      setListPeople((previous) => {
        const next = { ...previous };
        delete next[deleteList.id];
        return next;
      });
      if (activeList === deleteList.id) {
        setActiveList(remaining[0]?.id ?? null);
        if (remaining[0])
          void loadList(remaining[0].id).catch((cause) =>
            setError(message(cause)),
          );
      }
      setNotice(`${deleteList.name} deleted.`);
      setDeleteList(null);
    } catch (cause) {
      setDialogError(message(cause));
    } finally {
      mutationBusy.current = false;
      setCollectionPending(false);
    }
  }

  async function selectList(id: string) {
    setActiveList(id);
    setCollectionPending(true);
    setError("");
    try {
      await loadList(id);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setCollectionPending(false);
    }
  }
  return {
    lists,
    setLists,
    listPeople,
    listMemberships,
    activeList,
    setActiveList,
    picker,
    setPicker,
    nameAction,
    setNameAction,
    deleteList,
    setDeleteList,
    collectionPending,
    pickerPending,
    dialogError,
    setDialogError,
    loadList,
    selectList,
    openPicker,
    refreshMemberships,
    membership,
    saveName,
    removeList,
  };
}
