"use client";

import {
  useRef,
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { SEARCH_LIMITS } from "@/lib/search/schema";
import { Icon } from "./icon";
import styles from "./brief-form.module.css";

const subscribeToPlatform = () => () => {};
const platformShortcut = () =>
  navigator.platform.startsWith("Mac") ? "⌘" : "Ctrl";
const serverShortcut = () => "Ctrl";

const examples = [
  {
    label: "Frontend · React & TypeScript",
    brief:
      "Senior frontend engineer with React and TypeScript, 5+ years, open to work in New York",
  },
  {
    label: "Staff · AWS & Kubernetes",
    brief:
      "Staff engineer with Kubernetes and AWS, enterprise experience, based in Texas",
  },
  {
    label: "Data · Python & SQL",
    brief:
      "Mid-level data scientist with Python and SQL, startup background, computer science degree",
  },
];

type Props = {
  brief: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  pending?: boolean;
  compact?: boolean;
  submitted?: string;
  planNote?: string;
  exhausted?: boolean;
  onUpgrade?: () => void;
  previousSearchHref?: string;
};

export function BriefForm({
  brief,
  onChange,
  onSubmit,
  pending,
  compact,
  submitted,
  planNote,
  exhausted,
  onUpgrade,
  previousSearchHref,
}: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const shortcutKey = useSyncExternalStore(
    subscribeToPlatform,
    platformShortcut,
    serverShortcut,
  );
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !target.closest(
          "input, textarea, select, [role=dialog], [role=menu], [role=listbox], [role=combobox], [contenteditable]",
        )
      ) {
        event.preventDefault();
        setEditing(true);
        requestAnimationFrame(() => input.current?.focus());
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!pending && (exhausted || brief.trim())) {
      if (exhausted) onUpgrade?.();
      else onSubmit?.();
      setEditing(false);
    }
  }
  return (
    <section className={`${styles.section} ${compact ? styles.compact : ""}`}>
      <div className={styles.heading}>
        <h1>
          {compact ? (
            "Your candidate search"
          ) : (
            <>
              Describe who <br className={styles.mobileBreak} />
              you’re hiring.
            </>
          )}
        </h1>
        {!compact && <p>Describe the skills and experience you need.</p>}
      </div>
      {compact && !editing ? (
        <div className={styles.briefBar}>
          <p>
            <span className={styles.srOnly}>Candidate brief</span>
            <span title={submitted}>{submitted}</span>
          </p>
          <div className={styles.briefActions}>
            <button
              ref={editButton}
              type="button"
              disabled={pending}
              onClick={() => {
                setEditing(true);
                requestAnimationFrame(() => input.current?.focus());
              }}
            >
              Edit brief
            </button>
          </div>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit} aria-busy={pending}>
          <div className={styles.fieldHeading}>
            <label htmlFor="candidate-brief">Candidate brief</label>
            <span id="candidate-brief-count" className={styles.characterCount}>
              {brief.length.toLocaleString("en-US")}/
              {SEARCH_LIMITS.maxBriefLength.toLocaleString("en-US")} characters
            </span>
          </div>
          <textarea
            ref={input}
            id="candidate-brief"
            value={brief}
            onChange={(e) => onChange?.(e.target.value)}
            maxLength={SEARCH_LIMITS.maxBriefLength}
            aria-describedby="candidate-brief-count"
            rows={compact ? 2 : 4}
            readOnly={pending || !onChange}
            placeholder="Senior backend engineer, 6+ years, Go and PostgreSQL, based in Austin, open to work…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className={styles.actions}>
            <div className={styles.actionInfo}>
              {exhausted ? (
                <p className={styles.quota}>Free search used</p>
              ) : (
                !compact &&
                planNote && <p className={styles.quota}>{planNote}</p>
              )}
              <span className={styles.hint}>
                <kbd>{shortcutKey}</kbd> + <kbd>Enter</kbd> to search
              </span>
            </div>
            <div className={styles.actionButtons}>
              {compact && (
                <button
                  className={styles.cancel}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    onChange?.(submitted ?? "");
                    setEditing(false);
                    requestAnimationFrame(() => editButton.current?.focus());
                  }}
                >
                  Cancel
                </button>
              )}
              {(!compact || editing) && (
                <button
                  className={styles.submit}
                  type="submit"
                  disabled={
                    pending || (!exhausted && !brief.trim()) || !onSubmit
                  }
                >
                  <span>
                    {pending
                      ? "Finding candidates…"
                      : exhausted
                        ? "View plan"
                        : compact
                          ? "Search again"
                          : "Find candidates"}
                  </span>
                  <Icon name="arrow" size={18} />
                </button>
              )}
            </div>
          </div>
        </form>
      )}
      {!compact && (
        <div className={styles.examples}>
          <span>Try a starting point</span>
          <div>
            {examples.map((example) => (
              <button
                key={example.label}
                type="button"
                disabled={pending || !onChange}
                onClick={() => {
                  onChange?.(example.brief);
                  input.current?.focus();
                }}
              >
                {example.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {!compact && previousSearchHref && !pending && (
        <div className={styles.resume}>
          <a href={previousSearchHref}>Continue previous search</a>
        </div>
      )}
    </section>
  );
}
