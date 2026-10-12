"use client";

import { useState } from "react";
import { Popover } from "radix-ui";
import type { Candidate } from "@/lib/search/types";
import type { SearchExperience } from "@/lib/search/schema";
import type { ShortlistMembership } from "@/lib/search/contracts";
import { workHistoryEvidence } from "./work-history-evidence";
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
  remove = false,
  disabled = false,
}: {
  candidate: Candidate;
  saved: boolean;
  onToggle: (candidate: Candidate) => void;
  remove?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={styles.save}
      data-saved={saved}
      data-remove={remove}
      disabled={disabled}
      type="button"
      aria-label={
        remove
          ? `Remove ${candidate.full_name} from this shortlist`
          : `${saved ? "Manage shortlists for" : "Shortlist"} ${candidate.full_name}`
      }
      aria-pressed={remove ? undefined : saved}
      onClick={() => onToggle(candidate)}
    >
      <Icon
        name={remove ? "close" : "bookmark"}
        size={18}
        filled={saved && !remove}
      />
      <span>{remove ? "Remove" : saved ? "Shortlisted" : "Shortlist"}</span>
    </button>
  );
}

export function AvailabilityStatus() {
  return (
    <span className={styles.availability}>
      <span aria-hidden="true" />
      Open to work
    </span>
  );
}

export function SkillTags({
  skills,
  matched,
  limit,
  candidateName,
}: {
  skills: string[];
  matched: string[];
  limit?: number;
  candidateName?: string;
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
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              className={styles.more}
              type="button"
              aria-label={`Show ${skills.length - limit} more ${skills.length - limit === 1 ? "skill" : "skills"}${candidateName ? ` for ${candidateName}` : ""}`}
            >
              +{skills.length - limit}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className={styles.skillPopover}
              side="bottom"
              align="start"
              sideOffset={6}
              collisionPadding={16}
              aria-label="More skills"
            >
              <ul>
                {ordered.slice(limit).map((skill) => (
                  <li key={skill}>{skill}</li>
                ))}
              </ul>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
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
  remove = false,
  membershipPending = false,
  workRequirements,
  membership,
  recruiterId,
}: {
  candidate: Candidate;
  matched: string[];
  saved: boolean;
  selected: boolean;
  onOpen: (candidate: Candidate) => void;
  onToggle: (candidate: Candidate) => void;
  remove?: boolean;
  membershipPending?: boolean;
  workRequirements?: SearchExperience[];
  membership?: ShortlistMembership;
  recruiterId?: string;
}) {
  const evidence = workHistoryEvidence(candidate, workRequirements);
  return (
    <li className={styles.row} data-selected={selected}>
      <ProfileImage src={candidate.avatar_url} name={candidate.full_name} />
      <div className={styles.info}>
        <button
          className={styles.open}
          type="button"
          onClick={() => onOpen(candidate)}
          aria-label={`View ${candidate.full_name}, ${candidate.current_title}`}
          aria-haspopup="dialog"
        >
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
            {candidate.years_experience} years<span aria-hidden="true">·</span>
            {candidate.city}, {candidate.state}
            {candidate.open_to_work && <AvailabilityStatus />}
          </span>
          {evidence.length > 0 && (
            <span className={styles.evidence}>
              {evidence
                .map(
                  (job) =>
                    `${job.company_type === "enterprise" ? "Enterprise" : "Startup"} · ${job.company_name} (${job.end_year === null ? "current" : "past"})`,
                )
                .join("; ")}
            </span>
          )}
          {membership && (
            <span className={styles.evidence}>
              Added by{" "}
              {membership.added_by === recruiterId ? "you" : "a teammate"} ·{" "}
              <time
                dateTime={membership.added_at}
                title={new Date(membership.added_at).toLocaleString()}
              >
                {new Date(membership.added_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </time>
            </span>
          )}
        </button>
        <SkillTags
          skills={candidate.skills}
          matched={matched}
          limit={4}
          candidateName={candidate.full_name}
        />
      </div>
      <ShortlistButton
        candidate={candidate}
        saved={saved}
        onToggle={onToggle}
        remove={remove}
        disabled={membershipPending}
      />
    </li>
  );
}
