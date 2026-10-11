"use client";

import { useState } from "react";
import type { Candidate } from "@/lib/search/types";
import { Icon } from "./icon";
import styles from "./candidate-row.module.css";

export function ProfileImage({
  src,
  name,
  logo = false,
}: {
  src: string;
  name: string;
  logo?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={logo ? styles.logo : styles.avatar} aria-hidden="true">
      {failed ? (
        name.slice(
          0,
          1,
        ) /* Fixed-size supplied assets with a visible fallback. */
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={logo ? 20 : 48}
          height={logo ? 20 : 48}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

export function ShortlistButton({
  candidate,
  saved,
  onToggle,
}: {
  candidate: Candidate;
  saved: boolean;
  onToggle: (candidate: Candidate) => void;
}) {
  return (
    <button
      className={styles.save}
      data-saved={saved}
      type="button"
      aria-label={`${saved ? "Remove" : "Shortlist"} ${candidate.full_name}${saved ? " from shortlist" : ""}`}
      aria-pressed={saved}
      onClick={() => onToggle(candidate)}
    >
      <Icon name={saved ? "check" : "bookmark"} size={18} />
      <span>{saved ? "Shortlisted" : "Shortlist"}</span>
    </button>
  );
}

export function SkillTags({
  skills,
  matched,
  limit,
}: {
  skills: string[];
  matched: string[];
  limit?: number;
}) {
  const ordered = [
    ...skills.filter((s) => matched.includes(s)),
    ...skills.filter((s) => !matched.includes(s)),
  ];
  return (
    <div className={styles.skills}>
      {ordered.slice(0, limit).map((skill) => (
        <span key={skill} data-matched={matched.includes(skill)}>
          {matched.includes(skill) && (
            <>
              <Icon name="check" size={12} />
              <span className={styles.srOnly}>Requested skill: </span>
            </>
          )}
          {skill}
        </span>
      ))}
      {limit && skills.length > limit ? (
        <span className={styles.more}>+{skills.length - limit}</span>
      ) : null}
    </div>
  );
}

export function CandidateRow({
  candidate,
  matched,
  saved,
  selected,
  onOpen,
  onToggle,
}: {
  candidate: Candidate;
  matched: string[];
  saved: boolean;
  selected: boolean;
  onOpen: (candidate: Candidate) => void;
  onToggle: (candidate: Candidate) => void;
}) {
  return (
    <li className={styles.row} data-selected={selected}>
      <button
        className={styles.open}
        type="button"
        onClick={() => onOpen(candidate)}
        aria-label={`View ${candidate.full_name}, ${candidate.current_title}`}
        aria-haspopup="dialog"
      >
        <ProfileImage src={candidate.avatar_url} name={candidate.full_name} />
        <span className={styles.info}>
          <span className={styles.name}>{candidate.full_name}</span>
          <span className={styles.title}>
            {candidate.current_title}
            <span className={styles.at}>at</span>
            <ProfileImage
              src={candidate.current_company_logo_url}
              name={candidate.current_company}
              logo
            />
            {candidate.current_company}
          </span>
          <span className={styles.meta}>
            <span className={styles.seniority}>
              {candidate.seniority === "mid"
                ? "Mid-level"
                : candidate.seniority}
            </span>
            <span aria-hidden="true">·</span>
            {candidate.years_experience} years<span aria-hidden="true">·</span>
            {candidate.city}, {candidate.state}
            {candidate.open_to_work && (
              <span className={styles.availability}>
                <span aria-hidden="true" />
                Open to work
              </span>
            )}
          </span>
          <SkillTags skills={candidate.skills} matched={matched} limit={4} />
        </span>
      </button>
      <ShortlistButton
        candidate={candidate}
        saved={saved}
        onToggle={onToggle}
      />
    </li>
  );
}
