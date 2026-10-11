"use client";

import { useState, type ReactNode } from "react";
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
}: {
  title: string;
  description: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className={styles.smallDialog} onBackdropClick={onClose}>
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
}: {
  title: string;
  initial?: string;
  pending: boolean;
  error: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <WorkspaceDialog
      title={title}
      description="A name that helps your team find these people again."
      onClose={onClose}
    >
      <form
        className={styles.nameForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending && name.trim()) onSave(name.trim());
        }}
      >
        <label htmlFor="shortlist-name">
          List name
          <input
            id="shortlist-name"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Frontend shortlist"
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
              idle="Save list"
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
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <WorkspaceDialog
      title="Keep the search going."
      description="Your company’s free plan includes one search in total."
      onClose={onClose}
    >
      <div className={styles.upgradeContent}>
        <p>
          An active subscription unlocks new searches, requirement changes, and
          saved-search reruns. Your existing results, profiles, saved searches,
          and lists stay available.
        </p>
        <p>
          For this assessment, subscriptions are updated through verified Stripe
          events. There is no checkout to complete.
        </p>
        <footer>
          <button type="button" onClick={onClose}>
            Back to workspace
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={refreshing}
            onClick={onRefresh}
          >
            {refreshing ? "Checking…" : "Refresh plan"}
          </button>
        </footer>
      </div>
    </WorkspaceDialog>
  );
}
