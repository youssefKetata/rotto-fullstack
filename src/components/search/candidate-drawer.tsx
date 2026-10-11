"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import type { Candidate } from "@/lib/search/types";
import { ProfileImage, ShortlistButton, SkillTags } from "./candidate-row";
import { Icon } from "./icon";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import styles from "./candidate-drawer.module.css";

export function CandidateDrawer({
  candidate,
  matched,
  saved,
  onClose,
  onToggle,
  onStep,
  position,
  total,
}: {
  candidate: Candidate;
  matched: string[];
  saved: boolean;
  onClose: () => void;
  onToggle: (candidate: Candidate) => void;
  onStep: (direction: number) => void;
  position: number;
  total: number;
}) {
  const content = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    content.current?.scrollTo({ top: 0 });
  }, [candidate.id]);
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      onStep(event.key === "ArrowDown" ? 1 : -1);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={styles.drawer}
        onKeyDown={navigate}
        onBackdropClick={onClose}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeButton.current?.focus();
        }}
      >
        <div className={styles.frame}>
          <header className={styles.toolbar}>
            <span>Candidate profile</span>
            <div>
              {position >= 0 && (
                <>
                  <span className={styles.position}>
                    {position + 1} of {total}
                  </span>
                  <button
                    type="button"
                    aria-label="Previous candidate"
                    onClick={() => onStep(-1)}
                    disabled={position === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Next candidate"
                    onClick={() => onStep(1)}
                    disabled={position + 1 >= total}
                  >
                    ↓
                  </button>
                </>
              )}
              <button
                type="button"
                aria-label="Close candidate profile"
                ref={closeButton}
                onClick={onClose}
              >
                <Icon name="close" />
              </button>
            </div>
          </header>
          <div className={styles.content} ref={content}>
            <div className={styles.profile}>
              <ProfileImage
                src={candidate.avatar_url}
                name={candidate.full_name}
              />
              <DialogTitle asChild>
                <h2>{candidate.full_name}</h2>
              </DialogTitle>
              <DialogDescription asChild>
                <p>
                  {candidate.current_title} at {candidate.current_company}
                </p>
              </DialogDescription>
              <p className={styles.meta}>
                {candidate.city}, {candidate.state} ·{" "}
                {candidate.years_experience} years of experience
              </p>
              {candidate.open_to_work && (
                <span className={styles.open}>
                  <Icon name="check" size={15} />
                  Open to work
                </span>
              )}
            </div>
            <section className={styles.section}>
              <h3>Skills</h3>
              <SkillTags skills={candidate.skills} matched={matched} />
            </section>
            <section className={styles.section}>
              <h3>Experience</h3>
              {[...candidate.experiences]
                .sort((a, b) => a.position - b.position)
                .map((job) => (
                  <article key={job.position} className={styles.job}>
                    <ProfileImage
                      src={job.company_logo_url}
                      name={job.company_name}
                      logo
                    />
                    <div>
                      <h4>{job.title}</h4>
                      <p>
                        {job.company_name}{" "}
                        <span className={styles.tag}>{job.company_type}</span>
                      </p>
                      <p className={styles.meta}>
                        {job.start_year} — {job.end_year ?? "Present"}
                      </p>
                      <p className={styles.description}>{job.description}</p>
                    </div>
                  </article>
                ))}
              {!candidate.experiences.length && (
                <p className={styles.meta}>No experience provided.</p>
              )}
            </section>
            <section className={styles.section}>
              <h3>Education</h3>
              {[...candidate.education]
                .sort((a, b) => a.position - b.position)
                .map((education) => (
                  <article
                    key={education.position}
                    className={styles.education}
                  >
                    <h4>{education.school}</h4>
                    <p>
                      {education.degree} · {education.field}
                    </p>
                    {education.graduation_year && (
                      <p className={styles.meta}>{education.graduation_year}</p>
                    )}
                  </article>
                ))}
              {!candidate.education.length && (
                <p className={styles.meta}>No education provided.</p>
              )}
            </section>
          </div>
          <footer className={styles.footer}>
            <span>Shortlist saved in this tab.</span>
            <ShortlistButton
              candidate={candidate}
              saved={saved}
              onToggle={onToggle}
            />
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
