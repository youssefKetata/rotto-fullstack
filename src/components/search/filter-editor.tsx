"use client";

import {
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DropdownMenu as Menu } from "radix-ui";
import {
  Combobox,
  ComboboxValue,
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
  DialogPortalContext,
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
  removeEmptyEditorRecords,
  setSkillMode,
  stateLabels,
  stateLabel,
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
  plain?: boolean;
  onState: (state: TokenState) => void;
  onRemove: (others?: Token[]) => void;
};
const choices = (values: readonly string[]): Choice[] =>
  values.map((value) => ({ value, label: humanize(value) }));
const equalChoice = (item: Choice, value: Choice) => item.value === value.value;
const tokenWidthKey = (token: Token) =>
  JSON.stringify([token.label, token.state, token.excluded, token.mode]);
const engineeringRoles = vocabulary.roles.filter((role) =>
  role.endsWith(" Engineer"),
);

function ValueToken({
  token,
  inCombobox = false,
  onReveal,
}: {
  token: Token;
  inCombobox?: boolean;
  onReveal?: () => void;
}) {
  const portalContainer = useContext(DialogPortalContext);
  const trigger = useRef<HTMLButtonElement>(null);
  const changingState = useRef(false);
  const content = (
    <>
      {token.plain ? (
        <span className={styles.tokenTrigger}>{token.label}</span>
      ) : (
        <Menu.Root modal={false}>
          <Menu.Trigger asChild>
            <button
              type="button"
              ref={trigger}
              className={styles.tokenTrigger}
              aria-label={`${token.label}, ${stateLabels[token.state]}${token.excluded ? ", excluded condition" : ""}. Change requirement state`}
            >
              {(token.state !== "required" || token.excluded) && (
                <span className={styles.stateMark} aria-hidden="true">
                  {token.state === "preferred" ? "☆" : "−"}
                </span>
              )}
              <span>{token.label}</span>
              {token.mode && <small>{token.mode}</small>}
            </button>
          </Menu.Trigger>
          <Menu.Portal container={portalContainer}>
            <Menu.Content
              className={styles.tokenMenu}
              sideOffset={6}
              collisionPadding={12}
              onCloseAutoFocus={(event) => {
                if (changingState.current) {
                  event.preventDefault();
                  changingState.current = false;
                }
              }}
            >
              {token.context && (
                <Menu.Label className={styles.menuContext}>
                  {token.context}
                </Menu.Label>
              )}
              <Menu.RadioGroup
                value={token.state}
                onValueChange={(value) => {
                  const scope =
                    trigger.current?.closest("[data-requirement-field]") ??
                    trigger.current?.closest('[role="dialog"]');
                  const nextLabel = `${token.label}, ${stateLabels[value as TokenState]}`;
                  changingState.current = true;
                  onReveal?.();
                  token.onState(value as TokenState);
                  requestAnimationFrame(() => {
                    [
                      ...(scope?.querySelectorAll<HTMLButtonElement>(
                        "button",
                      ) ?? []),
                    ]
                      .find((button) =>
                        button
                          .getAttribute("aria-label")
                          ?.startsWith(nextLabel),
                      )
                      ?.focus();
                  });
                }}
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
      )}
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
      data-token-width-key={tokenWidthKey(token)}
      onKeyDown={(event) => {
        // The nested requirement menu and remove button own their keyboard events.
        if (event.target !== event.currentTarget) event.preventBaseUIHandler();
      }}
    >
      {content}
    </ComboboxChip>
  ) : (
    <span
      className={styles.token}
      data-state={token.state}
      data-token-width-key={tokenWidthKey(token)}
    >
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
  fullWidth = false,
}: {
  label: string;
  options: Choice[];
  tokens: Token[];
  onSelect: (value: string) => void;
  toolbar?: ReactNode;
  placeholder?: string;
  multiple?: boolean;
  fullWidth?: boolean;
}) {
  const id = useId();
  const anchor = useComboboxAnchor();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const groupTrigger = useRef<HTMLButtonElement>(null);
  const roleGroup =
    label === "Role" &&
    tokens.length === engineeringRoles.length &&
    new Set(tokens.map((token) => token.value)).size ===
      engineeringRoles.length &&
    tokens.every(
      (token) =>
        token.state === "required" &&
        token.ref.key === "roles" &&
        token.ref.group === "anyOf" &&
        token.ref.index === tokens[0].ref.index &&
        engineeringRoles.includes(token.value ?? ""),
    );
  const collapsedRoles = roleGroup && !expanded;
  const [visibleCount, setVisibleCount] = useState(tokens.length);
  const tokenWidths = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const container = anchor.current;
    if (!container || expanded || collapsedRoles) return;
    function measure() {
      if (!container) return;
      container
        .querySelectorAll<HTMLElement>("[data-token-width-key]")
        .forEach((element) => {
          tokenWidths.current.set(
            element.dataset.tokenWidthKey!,
            element.getBoundingClientRect().width,
          );
        });
      // Render new values once before measuring; collapsed values are unmounted,
      // so keyboard navigation cannot land on invisible controls.
      if (
        tokens.some((token) => !tokenWidths.current.has(tokenWidthKey(token)))
      ) {
        setVisibleCount(tokens.length);
        return;
      }
      const style = getComputedStyle(container);
      const available =
        container.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      const gap = parseFloat(style.columnGap) || 6;
      const input = container.querySelector("input");
      const inputWidth = input
        ? parseFloat(getComputedStyle(input).flexBasis) || 76
        : 76;
      let row = 1;
      let used = 0;
      let count = 0;
      for (const token of tokens) {
        const width = Math.min(
          tokenWidths.current.get(tokenWidthKey(token))!,
          available,
        );
        if (used && used + gap + width > available) {
          row++;
          used = 0;
        }
        used += (used ? gap : 0) + width;
        // Reserve room for the type-ahead on the second row as well.
        if (row + (used + gap + inputWidth > available ? 1 : 0) > 2) break;
        count++;
      }
      setVisibleCount(Math.max(tokens.length ? 1 : 0, count));
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [anchor, expanded, collapsedRoles, tokens, visibleCount]);
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
    <div
      className={`${styles.field} ${fullWidth ? styles.fullWidth : ""}`}
      data-requirement-field
    >
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
          } else {
            setText(value);
            if (details.reason === "input-change") setOpen(true);
          }
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
        <ComboboxChips
          id={`${id}-values`}
          ref={anchor}
          className={styles.fieldChips}
          aria-label={`${label} selections`}
        >
          <ComboboxValue>
            {() =>
              collapsedRoles ? (
                <span className={styles.token} data-state="required">
                  <button
                    ref={groupTrigger}
                    type="button"
                    className={styles.tokenTrigger}
                    aria-label="Show engineering role values"
                    aria-expanded={false}
                    aria-controls={`${id}-values`}
                    onKeyDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      setExpanded(true);
                      requestAnimationFrame(() =>
                        anchor.current
                          ?.querySelector<HTMLButtonElement>(
                            `button[aria-label$="Change requirement state"]`,
                          )
                          ?.focus(),
                      );
                    }}
                  >
                    Engineering roles ({tokens.length})
                  </button>
                  <button
                    type="button"
                    className={styles.tokenRemove}
                    aria-label="Remove all engineering roles"
                    onKeyDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      tokens[0].onRemove(tokens.slice(1));
                      requestAnimationFrame(() =>
                        anchor.current
                          ?.querySelector<HTMLInputElement>("input")
                          ?.focus(),
                      );
                    }}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </span>
              ) : (
                (expanded ? tokens : tokens.slice(0, visibleCount)).map(
                  (token) => (
                    <ValueToken
                      key={token.id}
                      token={token}
                      inCombobox={multiple}
                      onReveal={() => setExpanded(true)}
                    />
                  ),
                )
              )
            }
          </ComboboxValue>
          <ComboboxChipsInput
            id={id}
            onClick={() => setOpen(true)}
            placeholder={
              tokens.length
                ? multiple
                  ? "Add…"
                  : "Change…"
                : (placeholder ?? `Select ${label.toLowerCase()}…`)
            }
            autoComplete="off"
            onKeyDown={(event) => {
              if (
                event.key === "Backspace" &&
                !text &&
                !expanded &&
                (collapsedRoles || visibleCount < tokens.length)
              ) {
                event.preventDefault();
                event.preventBaseUIHandler();
                setExpanded(true);
                return;
              }
              if (event.key !== "Enter") return;
              // Enter selects a suggestion; it never submits the dialog form.
              event.preventDefault();
              if (!event.currentTarget.getAttribute("aria-activedescendant")) {
                event.preventBaseUIHandler();
                setOpen(true);
              }
            }}
          />
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
      {((!collapsedRoles && visibleCount < tokens.length) ||
        (roleGroup && expanded)) && (
        <button
          type="button"
          className={styles.showValues}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Show fewer" : "Show all"} ${label.toLowerCase()} values`}
          onClick={() => {
            setExpanded(!expanded);
            if (roleGroup && expanded)
              requestAnimationFrame(() => groupTrigger.current?.focus());
          }}
        >
          {expanded ? "Show less" : `Show all (${tokens.length})`}
        </button>
      )}
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

function ConditionCard({
  label,
  token,
  initiallyOpen,
  children,
}: {
  label: string;
  token: Token;
  initiallyOpen: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(initiallyOpen);
  const portalContainer = useContext(DialogPortalContext);
  const stateTrigger = useRef<HTMLButtonElement>(null);
  const changingState = useRef(false);
  return (
    <section className={styles.record} data-state={token.state}>
      <div className={styles.recordHeading}>
        <button
          type="button"
          className={styles.recordSummary}
          title={label}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <span>{label}</span>
          <Icon name="chevron" size={14} />
        </button>
        <Menu.Root modal={false}>
          <Menu.Trigger asChild>
            <button
              type="button"
              ref={stateTrigger}
              className={styles.recordState}
              aria-label={`${label}: ${stateLabels[token.state]}. Change condition state`}
            >
              {stateLabels[token.state]}
            </button>
          </Menu.Trigger>
          <Menu.Portal container={portalContainer}>
            <Menu.Content
              className={styles.tokenMenu}
              sideOffset={6}
              collisionPadding={12}
              onCloseAutoFocus={(event) => {
                if (changingState.current) event.preventDefault();
              }}
            >
              <Menu.RadioGroup
                value={token.state}
                onValueChange={(value) => {
                  const dialog =
                    stateTrigger.current?.closest('[role="dialog"]');
                  changingState.current = true;
                  token.onState(value as TokenState);
                  requestAnimationFrame(() => {
                    [
                      ...(dialog?.querySelectorAll<HTMLButtonElement>(
                        "button",
                      ) ?? []),
                    ]
                      .find(
                        (button) =>
                          button.getAttribute("aria-label") ===
                          `${label}: ${stateLabels[value as TokenState]}. Change condition state`,
                      )
                      ?.focus();
                    changingState.current = false;
                  });
                }}
              >
                {(["required", "preferred", "exclude"] as const).map(
                  (state) => (
                    <Menu.RadioItem
                      key={state}
                      value={state}
                      className={styles.menuItem}
                    >
                      <strong>{stateLabels[state]}</strong>
                      <Menu.ItemIndicator>
                        <Icon name="check" size={16} />
                      </Menu.ItemIndicator>
                    </Menu.RadioItem>
                  ),
                )}
              </Menu.RadioGroup>
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
        <button
          type="button"
          className={styles.recordRemove}
          aria-label={`Remove ${label} condition`}
          onClick={() => {
            const section = stateTrigger.current?.closest(
              "[data-condition-section]",
            );
            token.onRemove();
            requestAnimationFrame(() =>
              section
                ?.querySelector<HTMLButtonElement>("[data-add-condition]")
                ?.focus(),
            );
          }}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      {open && (
        <div id={id} className={styles.recordFields}>
          {children}
        </div>
      )}
    </section>
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
    label: stateLabel(state),
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
      job.companyTypes?.map(humanize).join(" or "),
      job.companies?.join(" or "),
      job.titles?.join(" or "),
      humanize(job.scope),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  function educationLabel(item: SearchEducation) {
    return (
      [
        item.fields?.join(" or "),
        item.degrees?.join(" or "),
        item.schools?.join(" or "),
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
        toolbar={
          selected.length > 1 ? (
            <span className={styles.fieldHint}>Any one</span>
          ) : undefined
        }
        tokens={selected.map((value, index) => ({
          ...makeToken(ref, humanize(value)),
          plain: true,
          id: `${key}-${index}`,
          value,
          context: `Changes apply to this entire ${ref.key === "experience" ? "work history" : "education"} requirement.`,
          onRemove: (others = []) =>
            changeRecord(
              ref,
              key,
              selected.filter(
                (item, i) =>
                  i !== index && !others.some((token) => token.value === item),
              ),
            ),
        }))}
        onSelect={(value) =>
          changeRecord(ref, key, [...new Set([...selected, value])])
        }
      />
    );
  }
  const extraTokens = tokens(["maxYears", "excludeLocations"]);
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
            const cleaned = removeEmptyEditorRecords(draft);
            const next = {
              ...draft,
              anyOf: cleaned.anyOf.filter(
                (criteria) => Object.keys(criteria).length,
              ),
              preferred: cleaned.preferred.filter(
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
                  All requirements must match. Click a value or condition state
                  to mark it Nice to have or Exclude.
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
            {draft.anyOf.length > 1 && (
              <div className={styles.branchChoice}>
                <FilterSelect
                  label="Accepted requirements"
                  value={String(branch)}
                  options={draft.anyOf.map((_, index) => ({
                    value: String(index),
                    label: `Set ${index + 1}`,
                  }))}
                  onChange={(value) => setBranch(Number(value))}
                />
                <p className={styles.hint}>
                  Candidates can match any set. Editing set {branch + 1}.
                </p>
              </div>
            )}
            <div className={`${styles.grid} ${styles.primaryGrid}`}>
              <VocabularyField
                label="Role"
                fullWidth
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
                label="Skills"
                fullWidth
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
              <section
                className={styles.conditionSection}
                aria-label="Work history requirements"
                data-condition-section
              >
                <h3>Work history</h3>
                {history.map((ref, index) => {
                  const job = tokenValue(draft, ref) as SearchExperience;
                  const empty =
                    job.scope === "any" &&
                    !job.companyTypes?.length &&
                    !job.companies?.length &&
                    !job.titles?.length;
                  const label = empty
                    ? "New work history condition"
                    : historyLabel(job);
                  const previousRequired = history
                    .slice(0, index)
                    .some(
                      (previous) =>
                        previous.group === "anyOf" &&
                        !tokenIsExcluded(draft, previous),
                    );
                  return (
                    <div
                      key={`work-${ref.group}-${ref.index}-${ref.valueIndex}`}
                    >
                      {ref.group === "anyOf" &&
                        !job.exclude &&
                        previousRequired && (
                          <p className={styles.conditionJoin}>
                            And also worked at
                          </p>
                        )}
                      <ConditionCard
                        label={label}
                        token={makeToken(ref, label)}
                        initiallyOpen={empty}
                      >
                        <div className={styles.grid}>
                          {recordField(
                            ref,
                            "companyTypes",
                            "Company type",
                            vocabulary.companyTypes,
                          )}
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
                            options={choices(["any", "current", "past"])}
                            onChange={(value) =>
                              changeRecord(ref, "scope", value)
                            }
                          />
                        </div>
                      </ConditionCard>
                    </div>
                  );
                })}
                <button
                  className={styles.textButton}
                  type="button"
                  data-add-condition
                  onClick={() => add("experience", { scope: "any" })}
                >
                  {history.length
                    ? "+ Add another work history condition"
                    : "+ Add work history"}
                </button>
              </section>
              <section
                className={styles.conditionSection}
                aria-label="Education requirements"
                data-condition-section
              >
                <h3>Education</h3>
                {education.map((ref, index) => {
                  const item = tokenValue(draft, ref) as SearchEducation;
                  const empty =
                    !item.fields?.length &&
                    !item.degrees?.length &&
                    !item.schools?.length &&
                    item.minGraduationYear === undefined &&
                    item.maxGraduationYear === undefined;
                  const label = empty
                    ? "New education condition"
                    : educationLabel(item);
                  const previousRequired = education
                    .slice(0, index)
                    .some(
                      (previous) =>
                        previous.group === "anyOf" &&
                        !tokenIsExcluded(draft, previous),
                    );
                  return (
                    <div
                      key={`education-${ref.group}-${ref.index}-${ref.valueIndex}`}
                    >
                      {ref.group === "anyOf" &&
                        !item.exclude &&
                        previousRequired && (
                          <p className={styles.conditionJoin}>
                            And also studied
                          </p>
                        )}
                      <ConditionCard
                        label={label}
                        token={makeToken(ref, label)}
                        initiallyOpen={empty}
                      >
                        <div className={styles.grid}>
                          {recordField(
                            ref,
                            "fields",
                            "Field of study",
                            vocabulary.fields,
                          )}
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
                            min={1900}
                            max={2100}
                            value={item.minGraduationYear}
                            onChange={(value) =>
                              changeRecord(ref, "minGraduationYear", value)
                            }
                          />
                          <NumberField
                            label="Graduated by"
                            min={1900}
                            max={2100}
                            value={item.maxGraduationYear}
                            onChange={(value) =>
                              changeRecord(ref, "maxGraduationYear", value)
                            }
                          />
                        </div>
                      </ConditionCard>
                    </div>
                  );
                })}
                <button
                  className={styles.textButton}
                  type="button"
                  data-add-condition
                  onClick={() => add("education", {})}
                >
                  {education.length
                    ? "+ Add another education condition"
                    : "+ Add education"}
                </button>
              </section>
              <details
                className={styles.advanced}
                open={extraTokens.length > 0 || undefined}
              >
                <summary>
                  <span>
                    More requirements
                    {extraTokens.length > 0
                      ? ` (${extraTokens.length} active)`
                      : ""}
                  </span>
                  <Icon name="chevron" size={16} />
                </summary>
                <div className={styles.advancedContent}>
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
                      label="Exclude location"
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
