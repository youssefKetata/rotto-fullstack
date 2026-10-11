"use client";

import { useState } from "react";
import { vocabulary } from "@/lib/search/filters";
import type { Filters } from "@/lib/search/types";
import { Icon } from "./icon";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FilterSelect } from "./filter-select";
import styles from "./filter-editor.module.css";

export function FilterEditor({
  filters,
  onApply,
  onClose,
}: {
  filters: Filters;
  onApply: (filters: Filters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(filters);
  const [skillSearch, setSkillSearch] = useState("");
  function set(key: keyof Filters, value: string) {
    setDraft((current) => {
      const next = { ...current };
      if (!value) delete next[key];
      else
        Object.assign(next, {
          [key]: key === "minYears" ? Number(value) : value,
        });
      return next;
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className={styles.dialog} onBackdropClick={onClose}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onApply(draft);
          }}
        >
          <header className={styles.header}>
            <div>
              <DialogTitle asChild>
                <h2>Make the search yours.</h2>
              </DialogTitle>
              <DialogDescription asChild>
                <p>Candidates must match every selected filter.</p>
              </DialogDescription>
            </div>
            <button type="button" aria-label="Close filters" onClick={onClose}>
              <Icon name="close" />
            </button>
          </header>
          <div className={styles.content}>
            <div className={styles.grid}>
              <FilterSelect
                label="Role"
                value={draft.role}
                anyLabel="Any role"
                options={vocabulary.roles.map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(value) => set("role", value)}
              />
              <FilterSelect
                label="Seniority"
                value={draft.seniority}
                anyLabel="Any seniority"
                options={["junior", "mid", "senior", "staff"].map((value) => ({
                  value,
                  label:
                    value === "mid"
                      ? "Mid-level"
                      : value[0].toUpperCase() + value.slice(1),
                }))}
                onChange={(value) => set("seniority", value)}
              />
              <label>
                Minimum experience
                <input
                  type="number"
                  min={0}
                  max={60}
                  placeholder="Any number of years"
                  value={draft.minYears ?? ""}
                  onChange={(e) => set("minYears", e.target.value)}
                />
              </label>
              <FilterSelect
                label="City"
                value={draft.city}
                anyLabel="Any city"
                options={vocabulary.cities.map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(value) => set("city", value)}
              />
              <FilterSelect
                label="State"
                value={draft.state}
                anyLabel="Any state"
                options={vocabulary.states.map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(value) => set("state", value)}
              />
              <FilterSelect
                label="Company background"
                value={draft.companyType}
                anyLabel="Any company type"
                options={[
                  { value: "startup", label: "Startup experience" },
                  { value: "enterprise", label: "Enterprise experience" },
                ]}
                onChange={(value) => set("companyType", value)}
              />
              <FilterSelect
                className={styles.full}
                label="Field of study"
                value={draft.field}
                anyLabel="Any field of study"
                options={vocabulary.fields.map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(value) => set("field", value)}
              />
            </div>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={!!draft.openToWork}
                onChange={(e) =>
                  setDraft((current) => {
                    const next = { ...current };
                    if (e.target.checked) next.openToWork = true;
                    else delete next.openToWork;
                    return next;
                  })
                }
              />
              Open to work only
            </label>
            <fieldset className={styles.skills}>
              <legend>
                Required skills <span>All selected skills must match</span>
              </legend>
              <label className={styles.skillSearch}>
                Find a skill
                <input
                  type="search"
                  placeholder="Search skills…"
                  value={skillSearch}
                  onChange={(e) => setSkillSearch(e.target.value)}
                />
              </label>
              <div className={styles.skillOptions}>
                {vocabulary.skills
                  .filter((skill) =>
                    skill.toLowerCase().includes(skillSearch.toLowerCase()),
                  )
                  .map((skill) => (
                    <label key={skill} className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={draft.skills.includes(skill)}
                        onChange={(e) =>
                          setDraft((current) => ({
                            ...current,
                            skills: e.target.checked
                              ? [...current.skills, skill]
                              : current.skills.filter((s) => s !== skill),
                          }))
                        }
                      />
                      {skill}
                    </label>
                  ))}
              </div>
            </fieldset>
          </div>
          <footer className={styles.footer}>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.apply}>
              Apply filters
              <Icon name="arrow" size={17} />
            </button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
