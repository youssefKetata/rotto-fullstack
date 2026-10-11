"use client";

import { useRef, useEffect, useState, type FormEvent } from "react";
import { Icon } from "./icon";
import styles from "./brief-form.module.css";

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
  onReset?: () => void;
  planNote?: string;
  exhausted?: boolean;
  onUpgrade?: () => void;
};

export function BriefForm({
  brief,
  onChange,
  onSubmit,
  pending,
  compact,
  submitted,
  onReset,
  planNote,
  exhausted,
  onUpgrade,
}: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
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
    if (!pending && brief.trim()) {
      if (exhausted) onUpgrade?.();
      else onSubmit?.();
      setEditing(false);
    }
  }
  return (
    <section className={`${styles.section} ${compact ? styles.compact : ""}`}>
      <div className={styles.heading}>
        {!compact && (
          <span className={styles.eyebrow}>
            A THOUGHTFUL WAY TO FIND TALENT
          </span>
        )}
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
        {!compact && (
          <p>
            The skills, the experience, the person you have in mind.
            <br />
            Start with a brief. Make it your own.
          </p>
        )}
      </div>
      {compact && !editing ? (
        <div className={styles.briefBar}>
          <p>
            <span>Candidate brief</span>
            <span>{submitted}</span>
          </p>
          <button
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
      ) : (
        <form className={styles.form} onSubmit={submit} aria-busy={pending}>
          <label htmlFor="candidate-brief">Candidate brief</label>
          <textarea
            ref={input}
            id="candidate-brief"
            value={brief}
            onChange={(e) => onChange?.(e.target.value)}
            maxLength={4000}
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
            <span className={styles.hint}>
              {brief.length >= 3200 ? (
                `${brief.length}/4,000 characters`
              ) : (
                <>
                  <kbd>Ctrl / ⌘</kbd> + <kbd>Enter</kbd> to search
                </>
              )}
            </span>
            <div className={styles.actionButtons}>
              {compact && (
                <button
                  className={styles.cancel}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    onChange?.(submitted ?? "");
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
              )}
              {(!compact || editing) && (
                <button
                  className={styles.submit}
                  type="submit"
                  disabled={pending || !brief.trim() || !onSubmit}
                >
                  <span>
                    {pending
                      ? "Finding candidates…"
                      : exhausted
                        ? "Upgrade to search"
                        : compact
                          ? "New search"
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
                <Icon name="arrow" size={15} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={styles.note}>
        <span>
          {planNote ?? "Describe your brief. Review the requirements."}
        </span>
        {compact && (
          <button type="button" disabled={pending} onClick={onReset}>
            Start over
          </button>
        )}
      </div>
    </section>
  );
}
