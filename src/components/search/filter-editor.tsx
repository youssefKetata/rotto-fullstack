"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { DropdownMenu as Menu } from "radix-ui";
import {
  Combobox,
  ComboboxValue,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChipsInput,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  searchVocabulary as vocabulary,
  validateSearchFilters,
  type SearchCriteria as Criteria,
  type SearchEducation,
  type SearchExperience,
  type SearchFilters,
  type SearchLocation,
} from "@/lib/search/schema";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FilterSelect } from "./filter-select";
import { Icon } from "./icon";
import { removeRequirement, requirementLabel } from "./filter-summary";
import {
  canExclude,
  changeTokenState,
  humanize,
  locationLabel,
  removeEditorTokens,
  setSkillMode,
  stateLabels,
  tokenIsExcluded,
  tokenState,
  tokenValue,
  type TokenRef,
  type TokenState,
} from "./requirement-editor-model";
import styles from "./filter-editor.module.css";

type Choice = { value: string; label: string; tokenId?: string };
type Token = {
  id: string;
  ref: TokenRef;
  value?: string;
  label: string;
  state: TokenState;
  excluded?: boolean;
  canExclude: boolean;
  mode?: string;
  context?: string;
  onState: (state: TokenState) => void;
  onRemove: (others?: Token[]) => void;
};
const choices = (values: readonly string[]): Choice[] =>
  values.map((value) => ({ value, label: humanize(value) }));
const equalChoice = (item: Choice, value: Choice) => item.value === value.value;

function ValueToken({
  token,
  inCombobox = false,
}: {
  token: Token;
  inCombobox?: boolean;
}) {
  const content = (
    <>
      <Menu.Root modal={false}>
        <Menu.Trigger asChild>
          <button
            type="button"
            className={styles.tokenTrigger}
            aria-label={`${token.label}, ${stateLabels[token.state]}${token.excluded ? ", excluded condition" : ""}. Change requirement state`}
          >
            {(token.state !== "required" || token.excluded) && (
              <span className={styles.stateMark} aria-hidden="true">
                {token.state === "preferred" ? "☆" : "−"}
              </span>
            )}
            <span>{token.label}</span>
            {token.state !== "required" && (
              <small>{stateLabels[token.state]}</small>
            )}
            {token.mode && <small>{token.mode}</small>}
            <Icon name="chevron" size={13} />
          </button>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            className={styles.tokenMenu}
            sideOffset={6}
            collisionPadding={12}
          >
            {token.context && (
              <Menu.Label className={styles.menuContext}>
                {token.context}
              </Menu.Label>
            )}
            <Menu.RadioGroup
              value={token.state}
              onValueChange={(value) => token.onState(value as TokenState)}
            >
              {(["required", "preferred", "exclude"] as const)
                .filter((state) => state !== "exclude" || token.canExclude)
                .map((state) => (
                  <Menu.RadioItem
                    key={state}
                    value={state}
                    className={styles.menuItem}
                  >
                    <span>
                      <strong>{stateLabels[state]}</strong>
                      {state === "preferred" && (
                        <small>
                          Doesn’t filter, ranks these candidates first.
                        </small>
                      )}
                    </span>
                    <Menu.ItemIndicator>
                      <Icon name="check" size={16} />
                    </Menu.ItemIndicator>
                  </Menu.RadioItem>
                ))}
            </Menu.RadioGroup>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      {inCombobox ? (
        <ComboboxChipRemove
          className={styles.tokenRemove}
          aria-label={`Remove ${token.label}, ${stateLabels[token.state]}`}
        />
      ) : (
        <button
          type="button"
          className={styles.tokenRemove}
          aria-label={`Remove ${token.label}, ${stateLabels[token.state]}`}
          onClick={() => token.onRemove()}
        >
          <Icon name="close" size={13} />
        </button>
      )}
    </>
  );
  return inCombobox ? (
    <ComboboxChip
      className={styles.token}
      data-state={token.state}
      onKeyDown={(event) => {
        // The nested requirement menu and remove button own their keyboard events.
        if (event.target !== event.currentTarget) event.preventBaseUIHandler();
      }}
    >
      {content}
    </ComboboxChip>
  ) : (
    <span className={styles.token} data-state={token.state}>
      {content}
    </span>
  );
}

function VocabularyField({
  label,
  options,
  tokens,
  onSelect,
  toolbar,
  placeholder,
  multiple = true,
}: {
  label: string;
  options: Choice[];
  tokens: Token[];
  onSelect: (value: string) => void;
  toolbar?: ReactNode;
  placeholder?: string;
  multiple?: boolean;
}) {
  const id = useId();
  const anchor = useComboboxAnchor();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () =>
      tokens.map((token) => ({
        tokenId: token.id,
        value: token.value ?? token.label,
        label: token.label,
      })),
    [tokens],
  );
  return (
    <div className={styles.field}>
      <div className={styles.fieldHeading}>
        <label htmlFor={id}>{label}</label>
        {toolbar}
      </div>
      <Combobox<Choice, boolean>
        items={options}
        multiple={multiple}
        value={multiple ? selected : (selected[0] ?? null)}
        inputValue={text}
        onInputValueChange={(value, details) => {
          // The selected value is already shown as a requirement chip.
          if (
            !multiple &&
            details.reason !== "input-change" &&
            details.reason !== "input-clear"
          ) {
            details.cancel();
            setText("");
          } else setText(value);
        }}
        open={open}
        onOpenChange={(next, details) => {
          if (multiple && !next && details.reason === "item-press") {
            details.cancel();
            return;
          }
          setOpen(next);
          if (!next) setText("");
        }}
        autoHighlight
        isItemEqualToValue={equalChoice}
        onValueChange={(value) => {
          const next = Array.isArray(value) ? value : value ? [value] : [];
          const added = next.find(
            (item) => !selected.some((current) => current.value === item.value),
          );
          if (added) onSelect(added.value);
          else {
            const removed = tokens.filter(
              (token) => !next.some((current) => current.tokenId === token.id),
            );
            removed[0]?.onRemove(removed.slice(1));
          }
          setText("");
        }}
      >
        <ComboboxChips ref={anchor} aria-label={`${label} selections`}>
          <ComboboxValue>
            {() =>
              tokens.map((token) => (
                <ValueToken
                  key={token.id}
                  token={token}
                  inCombobox={multiple}
                />
              ))
            }
          </ComboboxValue>
          <ComboboxChipsInput
            id={id}
            placeholder={
              tokens.length
                ? multiple
                  ? "Add…"
                  : "Change…"
                : (placeholder ?? `Select ${label.toLowerCase()}…`)
            }
            autoComplete="off"
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              // Enter selects a suggestion; it never submits the dialog form.
              event.preventDefault();
              if (!event.currentTarget.getAttribute("aria-activedescendant")) {
                event.preventBaseUIHandler();
                setOpen(true);
              }
            }}
          />
          <ComboboxTrigger aria-label={`Choose ${label.toLowerCase()}`} />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No matching values.</ComboboxEmpty>
          <ComboboxList aria-label={`${label} suggestions`}>
            {(choice: Choice) => (
              <ComboboxItem key={choice.value} value={choice}>
                {choice.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 60,
}: {
  label: string;
  value?: number;
  onChange: (value?: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className={styles.numberField}>
      <span className={styles.fieldHeading}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={1}
        value={value ?? ""}
        placeholder="Any"
        onChange={(event) =>
          onChange(
            event.target.value === "" ? undefined : Number(event.target.value),
          )
        }
      />
    </label>
  );
}
const locationChoices = [
  ...vocabulary.locations.map((location) => ({
    value: JSON.stringify(location),
    label: locationLabel(location),
  })),
  ...vocabulary.cities.map((city) => ({
    value: JSON.stringify({ city }),
    label: city,
  })),
  ...vocabulary.states.map((state) => ({
    value: JSON.stringify({ state }),
    label: state,
  })),
  ...vocabulary.countries.map((country) => ({
    value: JSON.stringify({ country }),
    label: humanize(country),
  })),
];

export function FilterEditor({
  filters,
  onApply,
  onClose,
}: {
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(filters));
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [branch, setBranch] = useState(0);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [educationOpen, setEducationOpen] = useState(false);
  const [newHistory, setNewHistory] = useState(false);
  const [newEducation, setNewEducation] = useState(false);
  const current = draft.anyOf[branch] ?? {};
  const mixedSkills =
    !!current.skillsAll?.length && !!current.skillsAny?.length;
  const skillMode =
    current.skillsAny?.length && !current.skillsAll?.length ? "any" : "all";
  function update(next: SearchFilters) {
    setDraft(next);
    setError("");
  }
  function set(key: keyof Criteria, value: unknown) {
    const next = structuredClone(draft);
    next.anyOf[branch] ??= {};
    if (value === undefined || (Array.isArray(value) && !value.length))
      delete next.anyOf[branch][key];
    else Object.assign(next.anyOf[branch], { [key]: value });
    update(next);
  }
  function add(key: keyof Criteria, value: unknown) {
    const previous = current[key];
    if (Array.isArray(previous)) {
      if (
        !previous.some((item) => JSON.stringify(item) === JSON.stringify(value))
      )
        set(key, [...previous, value]);
    } else if (["minYears", "maxYears", "openToWork"].includes(key))
      set(key, value);
    else set(key, [value]);
  }
  function refs(keys: (keyof Criteria)[]): TokenRef[] {
    return [
      { group: "anyOf" as const, index: branch, criteria: current },
      ...draft.preferred.map((criteria, index) => ({
        group: "preferred" as const,
        index,
        criteria,
      })),
    ].flatMap(({ group, index, criteria }) =>
      keys.flatMap((key): TokenRef[] => {
        const value = criteria[key];
        return value === undefined
          ? []
          : Array.isArray(value)
            ? value.map((_, valueIndex) => ({ group, index, key, valueIndex }))
            : [{ group, index, key }];
      }),
    );
  }
  function makeToken(ref: TokenRef, label: string): Token {
    return {
      id: `${ref.group}-${ref.index}-${ref.key}-${ref.valueIndex ?? "value"}`,
      ref,
      value:
        typeof tokenValue(draft, ref) === "object"
          ? JSON.stringify(tokenValue(draft, ref))
          : String(tokenValue(draft, ref)),
      label,
      state: tokenState(draft, ref),
      excluded: tokenIsExcluded(draft, ref),
      canExclude: canExclude(ref),
      onState: (state) => {
        const next = changeTokenState(draft, ref, state, branch, skillMode);
        update(next);
      },
      onRemove: (others = []) =>
        update(
          removeEditorTokens(draft, [ref, ...others.map((token) => token.ref)]),
        ),
    };
  }
  function tokens(keys: (keyof Criteria)[]) {
    return refs(keys).map((ref) => {
      const value = tokenValue(draft, ref);
      const label =
        ref.key === "locations" || ref.key === "excludeLocations"
          ? locationLabel(value as SearchLocation)
          : ref.key === "openToWork"
            ? value
              ? "Open to work"
              : ref.group === "anyOf"
                ? "Open to work"
                : "Not open to work"
            : ref.key === "minYears" || ref.key === "maxYears"
              ? `${ref.key === "minYears" ? "At least" : "At most"} ${value} years`
              : humanize(String(value));
      return {
        ...makeToken(ref, label),
        mode:
          mixedSkills && ["skillsAll", "skillsAny"].includes(ref.key)
            ? ref.key === "skillsAll"
              ? "All"
              : "Any one"
            : undefined,
      };
    });
  }
  const history = refs(["experience"]);
  const education = refs(["education"]);
  function historyLabel(job: SearchExperience) {
    return [
      ...(job.companyTypes ?? []).map(humanize),
      ...(job.companies ?? []),
      ...(job.titles ?? []),
      humanize(job.scope),
    ].join(" · ");
  }
  function educationLabel(item: SearchEducation) {
    return (
      [
        ...(item.fields ?? []),
        ...(item.degrees ?? []),
        ...(item.schools ?? []),
        item.minGraduationYear ? `From ${item.minGraduationYear}` : "",
        item.maxGraduationYear ? `By ${item.maxGraduationYear}` : "",
      ]
        .filter(Boolean)
        .join(" · ") || "Education"
    );
  }
  function changeRecord(ref: TokenRef, key: string, value: unknown) {
    const next = structuredClone(draft);
    const record = tokenValue(next, ref) as Record<string, unknown>;
    if (value === undefined || (Array.isArray(value) && !value.length))
      delete record[key];
    else record[key] = value;
    update(next);
  }
  function recordField(
    ref: TokenRef,
    key: string,
    label: string,
    values: readonly string[],
  ) {
    const record = tokenValue(draft, ref) as Record<string, unknown>;
    const selected = (record[key] ?? []) as string[];
    return (
      <VocabularyField
        label={label}
        options={choices(values)}
        tokens={selected.map((value, index) => ({
          ...makeToken(ref, humanize(value)),
          id: `${key}-${index}`,
          value,
          context: `Changes apply to this entire ${ref.key === "experience" ? "work history" : "education"} requirement.`,
          onRemove: () =>
            changeRecord(
              ref,
              key,
              selected.filter((_, i) => i !== index),
            ),
        }))}
        onSelect={(value) =>
          changeRecord(ref, key, [...new Set([...selected, value])])
        }
      />
    );
  }
  const historyId = useId();
  const educationId = useId();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={styles.dialog}
        onBackdropClick={onClose}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => {
          // Base UI portals are outside Radix's layer stack. Dismiss the open
          // combobox first; a second Escape can close the requirements dialog.
          if (
            document.querySelector('[data-slot="combobox-content"][data-open]')
          )
            event.preventDefault();
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const next = {
              ...draft,
              anyOf: draft.anyOf.filter(
                (criteria) => Object.keys(criteria).length,
              ),
              preferred: draft.preferred.filter(
                (criteria) => Object.keys(criteria).length,
              ),
            };
            const valid = validateSearchFilters(next);
            if (!valid) {
              setError(
                "Choose at least one supported requirement and check any conflicting values or ranges.",
              );
              return;
            }
            onApply(valid);
          }}
        >
          <header className={styles.header}>
            <div>
              <DialogTitle asChild>
                <h2 ref={titleRef} tabIndex={-1}>
                  Edit requirements
                </h2>
              </DialogTitle>
              <DialogDescription asChild>
                <p>
                  Candidates must match every requirement unless you mark it
                  “Nice to have”.
                </p>
              </DialogDescription>
            </div>
            <button
              type="button"
              className={styles.close}
              aria-label="Close requirements"
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          </header>
          <div className={styles.content}>
            {draft.issues.map((issue, index) => (
              <div className={styles.notice} key={`${issue.text}-${index}`}>
                <p>
                  <strong>{requirementLabel(issue)}</strong>
                  <span>
                    {" "}
                    ·{" "}
                    {issue.kind === "unsupported"
                      ? "Not in our data"
                      : "Cannot be checked as written"}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => update(removeRequirement(draft, index))}
                >
                  Continue without it
                </button>
              </div>
            ))}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <div className={styles.grid}>
              <VocabularyField
                label="Role"
                options={choices(vocabulary.roles)}
                tokens={tokens(["roles", "excludeRoles"])}
                onSelect={(value) => add("roles", value)}
              />
              <VocabularyField
                label="Level"
                options={choices(vocabulary.seniorities)}
                tokens={tokens(["seniorities", "excludeSeniorities"])}
                onSelect={(value) => add("seniorities", value)}
              />
              <VocabularyField
                label="Skills"
                options={choices(vocabulary.skills)}
                tokens={tokens(["skillsAll", "skillsAny", "skillsNone"])}
                onSelect={(value) =>
                  add(skillMode === "all" ? "skillsAll" : "skillsAny", value)
                }
                toolbar={
                  <div
                    className={styles.skillMode}
                    role="group"
                    aria-label="Skills must match"
                  >
                    <button
                      type="button"
                      aria-pressed={!mixedSkills && skillMode === "all"}
                      onClick={() => update(setSkillMode(draft, branch, "all"))}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      aria-pressed={!mixedSkills && skillMode === "any"}
                      onClick={() => update(setSkillMode(draft, branch, "any"))}
                    >
                      Any one
                    </button>
                  </div>
                }
              />
              <div className={styles.field}>
                <NumberField
                  label="Experience (min years)"
                  value={current.minYears}
                  onChange={(value) => set("minYears", value)}
                />
                <div className={styles.numberTokens}>
                  {tokens(["minYears"]).map((token) => (
                    <ValueToken key={token.id} token={token} />
                  ))}
                </div>
              </div>
              <VocabularyField
                label="Location"
                options={locationChoices}
                tokens={tokens(["locations"])}
                onSelect={(value) =>
                  add("locations", JSON.parse(value) as SearchLocation)
                }
              />
              <VocabularyField
                label="Availability"
                multiple={false}
                options={[
                  { value: "true", label: "Open to work" },
                  { value: "false", label: "Not open to work" },
                ]}
                tokens={tokens(["openToWork"])}
                onSelect={(value) => add("openToWork", value === "true")}
                placeholder="Any availability"
              />
            </div>
            <div className={styles.moreRows}>
              <button
                type="button"
                className={styles.disclosure}
                aria-expanded={historyOpen}
                aria-controls={historyId}
                onClick={() => setHistoryOpen(!historyOpen)}
              >
                <span>
                  <strong>
                    {history.length ? "Work history" : "+ Add work history"}
                  </strong>
                  {history.length > 0 && (
                    <small>
                      {history
                        .map((ref) =>
                          historyLabel(
                            tokenValue(draft, ref) as SearchExperience,
                          ),
                        )
                        .join("; ")}
                    </small>
                  )}
                </span>
                <Icon name="chevron" size={16} />
              </button>
              {historyOpen && (
                <div id={historyId} className={styles.expanded}>
                  {history.map((ref) => (
                    <section
                      key={`${ref.group}-${ref.index}-${ref.valueIndex}`}
                      className={styles.record}
                    >
                      <ValueToken
                        token={makeToken(
                          ref,
                          historyLabel(
                            tokenValue(draft, ref) as SearchExperience,
                          ),
                        )}
                      />
                      {recordField(
                        ref,
                        "companyTypes",
                        "Company type",
                        vocabulary.companyTypes,
                      )}
                    </section>
                  ))}
                  {(newHistory || !history.length) && (
                    <VocabularyField
                      label="Company type"
                      options={choices(vocabulary.companyTypes)}
                      tokens={[]}
                      onSelect={(value) => {
                        add("experience", {
                          scope: "any",
                          companyTypes: [value],
                        });
                        setNewHistory(false);
                      }}
                    />
                  )}
                  {history.length > 0 && !newHistory && (
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() => setNewHistory(true)}
                    >
                      + Add work history
                    </button>
                  )}
                </div>
              )}
              <button
                type="button"
                className={styles.disclosure}
                aria-expanded={educationOpen}
                aria-controls={educationId}
                onClick={() => setEducationOpen(!educationOpen)}
              >
                <span>
                  <strong>
                    {education.length ? "Education" : "+ Add education"}
                  </strong>
                  {education.length > 0 && (
                    <small>
                      {education
                        .map((ref) =>
                          educationLabel(
                            tokenValue(draft, ref) as SearchEducation,
                          ),
                        )
                        .join("; ")}
                    </small>
                  )}
                </span>
                <Icon name="chevron" size={16} />
              </button>
              {educationOpen && (
                <div id={educationId} className={styles.expanded}>
                  {education.map((ref) => (
                    <section
                      key={`${ref.group}-${ref.index}-${ref.valueIndex}`}
                      className={styles.record}
                    >
                      <ValueToken
                        token={makeToken(
                          ref,
                          educationLabel(
                            tokenValue(draft, ref) as SearchEducation,
                          ),
                        )}
                      />
                      {recordField(
                        ref,
                        "fields",
                        "Education",
                        vocabulary.fields,
                      )}
                    </section>
                  ))}
                  {(newEducation || !education.length) && (
                    <VocabularyField
                      label="Education"
                      options={choices(vocabulary.fields)}
                      tokens={[]}
                      placeholder="Search fields of study…"
                      onSelect={(value) => {
                        add("education", { fields: [value] });
                        setNewEducation(false);
                      }}
                    />
                  )}
                  {education.length > 0 && !newEducation && (
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() => setNewEducation(true)}
                    >
                      + Add education
                    </button>
                  )}
                </div>
              )}
              <details className={styles.advanced}>
                <summary>
                  Advanced <Icon name="chevron" size={16} />
                </summary>
                <div className={styles.advancedContent}>
                  {draft.anyOf.length > 1 && (
                    <FilterSelect
                      label="Accepted requirements"
                      value={String(branch)}
                      anyLabel="Choose a set"
                      options={draft.anyOf.map((_, index) => ({
                        value: String(index),
                        label: `Set ${index + 1}`,
                      }))}
                      onChange={(value) => setBranch(Number(value))}
                    />
                  )}
                  {draft.anyOf.length > 1 && (
                    <p className={styles.hint}>
                      A candidate can match any accepted set. You’re editing set{" "}
                      {branch + 1}.
                    </p>
                  )}
                  <div className={styles.grid}>
                    <div className={styles.field}>
                      <NumberField
                        label="Experience (max years)"
                        value={current.maxYears}
                        onChange={(value) => set("maxYears", value)}
                      />
                      <div className={styles.numberTokens}>
                        {tokens(["maxYears"]).map((token) => (
                          <ValueToken key={token.id} token={token} />
                        ))}
                      </div>
                    </div>
                    <VocabularyField
                      label="Location"
                      options={locationChoices}
                      tokens={tokens(["excludeLocations"])}
                      placeholder="Search locations to exclude…"
                      onSelect={(value) =>
                        add(
                          "excludeLocations",
                          JSON.parse(value) as SearchLocation,
                        )
                      }
                    />
                  </div>
                  {history.map((ref, index) => {
                    const job = tokenValue(draft, ref) as SearchExperience;
                    return (
                      <section
                        className={styles.record}
                        key={`work-${ref.group}-${ref.index}-${ref.valueIndex}`}
                      >
                        <h3>Work history {index + 1}</h3>
                        <div className={styles.grid}>
                          {recordField(
                            ref,
                            "companies",
                            "Company",
                            vocabulary.companies,
                          )}
                          {recordField(
                            ref,
                            "titles",
                            "Job title",
                            vocabulary.titles,
                          )}
                          <FilterSelect
                            label="When"
                            value={job.scope}
                            anyLabel="Any job"
                            options={choices(["any", "current", "past"])}
                            onChange={(value) =>
                              changeRecord(ref, "scope", value || "any")
                            }
                          />
                        </div>
                      </section>
                    );
                  })}
                  <button
                    className={styles.textButton}
                    type="button"
                    onClick={() => {
                      add("experience", { scope: "any" });
                    }}
                  >
                    + Add work history
                  </button>
                  {education.map((ref, index) => {
                    const item = tokenValue(draft, ref) as SearchEducation;
                    return (
                      <section
                        className={styles.record}
                        key={`education-${ref.group}-${ref.index}-${ref.valueIndex}`}
                      >
                        <h3>Education {index + 1}</h3>
                        <div className={styles.grid}>
                          {recordField(
                            ref,
                            "degrees",
                            "Degree",
                            vocabulary.degrees,
                          )}
                          {recordField(
                            ref,
                            "schools",
                            "School",
                            vocabulary.schools,
                          )}
                          <NumberField
                            label="Graduated from"
                            min={1950}
                            max={2100}
                            value={item.minGraduationYear}
                            onChange={(value) =>
                              changeRecord(ref, "minGraduationYear", value)
                            }
                          />
                          <NumberField
                            label="Graduated by"
                            min={1950}
                            max={2100}
                            value={item.maxGraduationYear}
                            onChange={(value) =>
                              changeRecord(ref, "maxGraduationYear", value)
                            }
                          />
                        </div>
                      </section>
                    );
                  })}
                  <button
                    className={styles.textButton}
                    type="button"
                    onClick={() => {
                      add("education", {});
                    }}
                  >
                    + Add education
                  </button>
                </div>
              </details>
            </div>
          </div>
          <footer className={styles.footer}>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.primary}>
              Update results
            </button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
