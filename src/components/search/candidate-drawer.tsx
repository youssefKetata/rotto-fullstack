"use client";

import {
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Popover } from "radix-ui";
import type { Candidate } from "@/lib/search/types";
import { AvailabilityStatus, ProfileImage, SkillTags } from "./candidate-row";
import type { Shortlist } from "@/lib/search/contracts";
import { Icon } from "./icon";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogPortalContext,
} from "@/components/ui/dialog";
import styles from "./candidate-drawer.module.css";

export function CandidateDrawer({
  candidate,
  matched,
  saved,
  onClose,
  lists,
  memberListIds,
  currentList,
  membershipPending,
  membershipError,
  onRefreshMemberships,
  onMembership,
  onCreateList,
  onStep,
  position,
  total,
}: {
  candidate: Candidate;
  matched: string[];
  saved: boolean;
  onClose: () => void;
  lists: Shortlist[];
  memberListIds: string[];
  currentList?: Shortlist;
  membershipPending: boolean;
  membershipError: string;
  onRefreshMemberships: () => void;
  onMembership: (
    list: Shortlist,
    candidate: Candidate,
    remove: boolean,
  ) => void;
  onCreateList: () => void;
  onStep: (direction: number) => void;
  position: number;
  total: number;
}) {
  const content = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [listsOpen, setListsOpen] = useState(false);
  const [drawerBoundary, setDrawerBoundary] = useState<HTMLDivElement | null>(
    null,
  );
  const memberLists = lists.filter((list) => memberListIds.includes(list.id));
  const inCurrentList = !!currentList && memberListIds.includes(currentList.id);
  useEffect(() => {
    content.current?.scrollTo({ top: 0 });
  }, [candidate.id]);
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (
      listsOpen ||
      (event.target instanceof HTMLElement &&
        event.target.closest("input, [role='menu'], [data-list-picker]"))
    )
      return;
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
        onInteractOutside={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("[data-sonner-toast]")
          )
            event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeButton.current?.focus();
        }}
      >
        <div className={styles.frame} ref={setDrawerBoundary}>
          <header className={styles.toolbar}>
            <span>Candidate profile</span>
            <div>
              {position >= 0 && total > 1 && (
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
                <div className={styles.open}>
                  <AvailabilityStatus />
                </div>
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
            <Popover.Root
              open={listsOpen}
              onOpenChange={(open) => {
                setListsOpen(open);
                if (open && !membershipPending) onRefreshMemberships();
              }}
            >
              <div className={styles.membership}>
                <span>
                  {memberLists.length
                    ? memberLists.length === 1
                      ? `In ${memberLists[0].name}`
                      : `In ${memberLists.length} lists`
                    : "Not in a shortlist"}
                </span>
                {memberLists.length > 0 && (
                  <Popover.Trigger asChild>
                    <button type="button" className={styles.changeLists}>
                      Manage
                    </button>
                  </Popover.Trigger>
                )}
              </div>
              {inCurrentList && currentList ? (
                <button
                  className={styles.shortlistAction}
                  data-remove
                  type="button"
                  disabled={membershipPending}
                  aria-label={`Remove ${candidate.full_name} from ${currentList.name}`}
                  onClick={() => onMembership(currentList, candidate, true)}
                >
                  <Icon name="close" size={16} />
                  Remove
                </button>
              ) : memberLists.length === 0 ? (
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className={styles.shortlistAction}
                    aria-label={`Choose shortlists for ${candidate.full_name}`}
                  >
                    <Icon name="bookmark" size={16} filled={saved} />
                    Shortlist
                  </button>
                </Popover.Trigger>
              ) : null}
              <DrawerListPicker
                lists={lists}
                boundary={drawerBoundary}
                memberListIds={memberListIds}
                pending={membershipPending}
                error={membershipError}
                onMembership={(list, remove) =>
                  onMembership(list, candidate, remove)
                }
                onCreate={() => {
                  setListsOpen(false);
                  onCreateList();
                }}
              />
            </Popover.Root>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DrawerListPicker({
  boundary,
  lists,
  memberListIds,
  pending,
  error,
  onMembership,
  onCreate,
}: {
  boundary: HTMLDivElement | null;
  lists: Shortlist[];
  memberListIds: string[];
  pending: boolean;
  error: string;
  onMembership: (list: Shortlist, remove: boolean) => void;
  onCreate: () => void;
}) {
  const portalContainer = useContext(DialogPortalContext);
  return (
    <Popover.Portal container={portalContainer}>
      <Popover.Content
        className={styles.listPicker}
        side="top"
        align="start"
        sideOffset={10}
        collisionPadding={16}
        collisionBoundary={boundary}
        aria-label="Choose shortlists"
        data-list-picker
      >
        <h3>Choose shortlists</h3>
        <div aria-busy={pending}>
          {lists.map((list) => {
            const member = memberListIds.includes(list.id);
            return (
              <button
                key={list.id}
                type="button"
                disabled={pending}
                aria-pressed={member}
                onClick={() => onMembership(list, member)}
              >
                <span>{list.name}</span>
                <Icon name={member ? "check" : "bookmark"} size={16} />
              </button>
            );
          })}
          {!lists.length && <p>Create a list to shortlist this candidate.</p>}
          {error && (
            <p role="alert" className={styles.pickerError}>
              {error}
            </p>
          )}
          <button type="button" disabled={pending} onClick={onCreate}>
            + Create a list
          </button>
        </div>
      </Popover.Content>
    </Popover.Portal>
  );
}
