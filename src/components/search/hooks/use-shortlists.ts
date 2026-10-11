"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { searchApi } from "@/lib/search/browser";
import type { Shortlist, ShortlistDetail } from "@/lib/search/contracts";
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
    if (!signal?.aborted)
      setListPeople((previous) => ({ ...previous, [id]: data.people }));
    return data.people;
  }, []);

  async function openPicker(person: Candidate) {
    setPicker(person);
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

  async function membership(
    list: Shortlist,
    person: Candidate,
    remove: boolean,
  ) {
    if (mutationBusy.current) return;
    mutationBusy.current = true;
    setPickerPending(true);
    setDialogError("");
    try {
      await searchApi(
        `/api/shortlists/${encodeURIComponent(list.id)}/people/${encodeURIComponent(person.id)}`,
        { method: remove ? "DELETE" : "POST" },
      );
      setListPeople((previous) => ({
        ...previous,
        [list.id]: remove
          ? (previous[list.id] ?? []).filter((item) => item.id !== person.id)
          : [
              ...(previous[list.id] ?? []).filter(
                (item) => item.id !== person.id,
              ),
              person,
            ],
      }));
      setNotice(
        `${person.full_name} ${remove ? "removed from" : "added to"} ${list.name}.`,
      );
    } catch (cause) {
      if (picker) setDialogError(message(cause));
      else setError(message(cause));
    } finally {
      mutationBusy.current = false;
      setPickerPending(false);
    }
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
    membership,
    saveName,
    removeList,
  };
}
