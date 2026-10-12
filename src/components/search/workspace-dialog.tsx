"use client";

import { useId, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Icon } from "./icon";
import styles from "./search-workspace.module.css";

export function PendingLabel({
  pending,
  idle,
  loading,
}: {
  pending: boolean;
  idle: string;
  loading: string;
}) {
  return (
    <span className={styles.pendingLabel} aria-live="polite" aria-atomic="true">
      <span aria-hidden={pending}>{idle}</span>
      <span aria-hidden={!pending}>{loading}</span>
    </span>
  );
}

export function WorkspaceDialog({
  title,
  description,
  onClose,
  children,
  initialFocus,
}: {
  title: string;
  description: ReactNode;
  onClose: () => void;
  children: ReactNode;
  initialFocus?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={styles.smallDialog}
        onBackdropClick={onClose}
        onOpenAutoFocus={(event) => {
          if (initialFocus?.current) {
            event.preventDefault();
            initialFocus.current.focus();
          }
        }}
      >
        <header>
          <div>
            <DialogTitle asChild>
              <h2>{title}</h2>
            </DialogTitle>
            <DialogDescription asChild>
              <p>{description}</p>
            </DialogDescription>
          </div>
          <button type="button" aria-label="Close dialog" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function NameDialog({
  title,
  initial = "",
  pending,
  error,
  onSave,
  onClose,
  searchName = false,
}: {
  title: string;
  initial?: string;
  searchName?: boolean;
  pending: boolean;
  error: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const nameInput = useRef<HTMLInputElement>(null);
  const nameId = useId();
  return (
    <WorkspaceDialog
      title={title}
      description={
        searchName
          ? "The brief and requirements stay the same."
          : "A name that helps your team find these people again."
      }
      onClose={onClose}
      initialFocus={nameInput}
    >
      <form
        className={styles.nameForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending && name.trim()) onSave(name.trim());
        }}
      >
        <label htmlFor={nameId}>
          {searchName ? "Search name" : "List name"}
          <input
            id={nameId}
            ref={nameInput}
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              searchName
                ? "e.g. Staff engineers in Texas"
                : "e.g. Frontend shortlist"
            }
            autoFocus
            disabled={pending}
          />
        </label>
        {error && (
          <p className={styles.dialogError} role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={pending || !name.trim()}
          >
            <PendingLabel
              pending={pending}
              idle={searchName ? "Save name" : "Save list"}
              loading="Saving…"
            />
          </button>
        </footer>
      </form>
    </WorkspaceDialog>
  );
}

export function UpgradeDialog({
  onClose,
  onRefresh,
  refreshing,
}: {
  onClose: () => void;
  onRefresh: () => Promise<"free" | "paid" | null>;
  refreshing: boolean;
}) {
  const [feedback, setFeedback] = useState("");
  return (
    <WorkspaceDialog
      title="Your free search is used"
      description="Ask your workspace administrator to activate a paid plan for new searches."
      onClose={onClose}
    >
      <div className={styles.upgradeContent}>
        <p>You can still browse your results and manage shortlists.</p>
        <p
          className={styles.upgradeStatus}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {refreshing
            ? "Checking your company’s plan…"
            : feedback || "Already activated? Check your plan."}
        </p>
        <footer>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={refreshing}
            onClick={async () => {
              const plan = await onRefresh();
              setFeedback(
                plan === "free"
                  ? "Still on the free plan."
                  : plan === null
                    ? "We couldn’t check your plan. Please try again."
                    : "Your paid plan is active.",
              );
            }}
          >
            <PendingLabel
              pending={refreshing}
              idle="Check plan"
              loading="Checking…"
            />
          </button>
        </footer>
      </div>
    </WorkspaceDialog>
  );
}
