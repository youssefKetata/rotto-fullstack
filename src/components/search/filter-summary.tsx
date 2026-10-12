import { Tooltip } from "radix-ui";
import {
  searchAliases,
  searchVocabulary,
  type SearchFilters,
} from "@/lib/search/schema";
import { Icon } from "./icon";
import styles from "./search-workspace.module.css";
import { humanize } from "./requirement-editor-model";

type Criteria = SearchFilters["anyOf"][number];
type Chip = {
  label: string;
  remove: (criteria: Criteria) => void;
  help?: string;
};

export function requirementLabel(issue: SearchFilters["issues"][number]) {
  return /japanese/i.test(issue.text) && issue.kind === "unsupported"
    ? "Japanese language"
    : issue.text.replace(/[.]+$/, "");
}

export function requirementExplanation(issue: SearchFilters["issues"][number]) {
  if (issue.kind === "unsupported")
    return /language|japanese/i.test(issue.text)
      ? "Not in our data: candidate profiles have no language information."
      : "Not in our data: candidate profiles cannot verify this requirement.";
  return issue.kind === "contradictory"
    ? "These requirements conflict. Edit them or remove this requirement."
    : "This requirement needs clarification before it can be checked.";
}

export function removeRequirement(filters: SearchFilters, index: number) {
  return {
    ...filters,
    issues: filters.issues.filter((_, i) => i !== index),
  };
}
const title = (value: string) =>
  value === "mid"
    ? "Mid-level"
    : value.charAt(0).toUpperCase() + value.slice(1);
const stateName = (value: string) => {
  const name = Object.entries(searchAliases.states).find(
    ([, code]) => code === value,
  )?.[0];
  return name ? name.split(" ").map(title).join(" ") : value;
};

function chips(criteria: Criteria): Chip[] {
  const result: Chip[] = [];
  const arrays: [keyof Criteria, string][] = [
    ["roles", "Role"],
    ["excludeRoles", "Exclude Role"],
    ["seniorities", "Level"],
    ["excludeSeniorities", "Exclude Level"],
    ["skillsAll", "Skill"],
    ["skillsAny", "Skill (Any one)"],
    ["skillsNone", "Exclude Skill"],
  ];
  for (const [key, label] of arrays) {
    const values = criteria[key] as string[] | undefined;
    const items =
      values?.map((value, index): Chip => ({
        label: `${label}: ${key.toLowerCase().includes("senior") ? title(value) : value}`,
        remove(next) {
          const remaining = (next[key] as string[]).filter(
            (_, i) => i !== index,
          );
          if (remaining.length) Object.assign(next, { [key]: remaining });
          else delete next[key];
        },
      })) ?? [];
    if (
      items.length > 1 &&
      ["roles", "seniorities", "skillsAll", "skillsAny"].includes(key)
    ) {
      const mode = key === "skillsAll" ? "all" : "any";
      const label =
        key === "roles"
          ? `Role: Any of ${items.length} ${values!.every((value) => value.endsWith(" Engineer")) ? "engineering roles" : "roles"}`
          : key === "seniorities"
            ? `Level: ${values!.map(title).join(" or ")}`
            : `Skills: ${items.length <= 3 ? values!.join(mode === "all" ? " + " : " or ") : `${mode === "all" ? "All" : "Any of"} ${items.length} skills`}`;
      result.push({
        label,
        help: `${key === "roles" && values!.length === searchVocabulary.roles.filter((role) => role.endsWith(" Engineer")).length && values!.every((value) => value.endsWith(" Engineer")) ? `“Engineer” covers ${items.length} roles. A candidate needs only one: ` : `Match ${mode === "all" ? "all" : "any one"}: `}${values!.map(title).join(", ")}.`,
        remove(next) {
          delete next[key];
        },
      });
    } else result.push(...items);
  }
  for (const key of ["minYears", "maxYears"] as const) {
    if (criteria[key] !== undefined)
      result.push({
        label: `Experience: ${key === "minYears" ? "At least" : "At most"} ${criteria[key]} years`,
        remove(next) {
          delete next[key];
        },
      });
  }
  if (criteria.openToWork !== undefined)
    result.push({
      label: `Availability: ${criteria.openToWork ? "Open to work" : "Not open to work"}`,
      remove(next) {
        delete next.openToWork;
      },
    });
  for (const key of ["locations", "excludeLocations"] as const) {
    criteria[key]?.forEach((location, index) =>
      result.push({
        label: `${key === "excludeLocations" ? "Exclude location" : "Location"}: ${[location.city, location.state ? (location.city ? location.state : stateName(location.state)) : undefined, location.country && (!location.state || location.country !== "US") ? humanize(location.country) : undefined].filter(Boolean).join(", ")}`,
        remove(next) {
          next[key] = next[key]?.filter((_, i) => i !== index);
          if (!next[key]?.length) delete next[key];
        },
      }),
    );
  }
  criteria.experience?.forEach((experience, index) =>
    result.push({
      label: `${experience.exclude ? "Exclude work history" : "Worked at"}: ${[...(experience.companyTypes ?? []).map(humanize), ...(experience.companies ?? []), ...(experience.titles ?? []), experience.scope !== "any" ? humanize(experience.scope) : ""].filter(Boolean).join(" · ") || "Any company"}`,
      remove(next) {
        next.experience = next.experience?.filter((_, i) => i !== index);
        if (!next.experience?.length) delete next.experience;
      },
    }),
  );
  criteria.education?.forEach((education, index) =>
    result.push({
      label: `${education.exclude ? "Exclude education" : "Education"}: ${[...(education.degrees ?? []), ...(education.schools ?? []), ...(education.fields ?? []), education.minGraduationYear !== undefined ? `Graduated from ${education.minGraduationYear}` : "", education.maxGraduationYear !== undefined ? `Graduated by ${education.maxGraduationYear}` : ""].filter(Boolean).join(" · ")}`,
      remove(next) {
        next.education = next.education?.filter((_, i) => i !== index);
        if (!next.education?.length) delete next.education;
      },
    }),
  );
  return result;
}

export function requestedSkills(filters: SearchFilters | null) {
  return [
    ...new Set(
      [...(filters?.anyOf ?? []), ...(filters?.preferred ?? [])].flatMap(
        (criteria) => [
          ...(criteria.skillsAll ?? []),
          ...(criteria.skillsAny ?? []),
        ],
      ),
    ),
  ];
}

export function FilterSummary({
  filters,
  disabled,
  onChange,
  onEdit,
  onRemoveRequirement,
}: {
  filters: SearchFilters;
  disabled: boolean;
  onChange: (filters: SearchFilters) => void;
  onEdit: () => void;
  onRemoveRequirement: (index: number) => void;
}) {
  function renderChip(
    chip: Chip,
    index: number,
    preferred: boolean,
    key: string,
  ) {
    return (
      <div className={styles.chip} data-preferred={preferred} key={key}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              disabled={disabled}
              onClick={onEdit}
              aria-label={`Edit ${chip.label}`}
            >
              {chip.label}
            </button>
          </Tooltip.Trigger>
          {chip.help && (
            <Tooltip.Portal>
              <Tooltip.Content
                className={styles.chipHelp}
                side="top"
                sideOffset={6}
                collisionPadding={16}
              >
                {chip.help}
              </Tooltip.Content>
            </Tooltip.Portal>
          )}
        </Tooltip.Root>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Remove ${chip.label}`}
          onClick={(event) => {
            const chipElement = event.currentTarget.parentElement;
            const chipGroup = chipElement?.parentElement;
            const nextLabel = (
              chipElement?.nextElementSibling ??
              chipElement?.previousElementSibling
            )
              ?.querySelector("button")
              ?.getAttribute("aria-label");
            const next = structuredClone(filters);
            chip.remove((preferred ? next.preferred : next.anyOf)[index]);
            if (preferred)
              next.preferred = next.preferred.filter(
                (item) => Object.keys(item).length > 0,
              );
            else
              next.anyOf = next.anyOf.filter(
                (item) => Object.keys(item).length > 0,
              );
            onChange(next);
            requestAnimationFrame(() => {
              const nextButton =
                chipGroup?.isConnected && nextLabel
                  ? [
                      ...chipGroup.querySelectorAll<HTMLButtonElement>(
                        "button",
                      ),
                    ].find(
                      (button) =>
                        button.getAttribute("aria-label") === nextLabel,
                    )
                  : undefined;
              (
                nextButton ??
                document.querySelector<HTMLButtonElement>(
                  "[data-edit-requirements]",
                )
              )?.focus();
            });
          }}
        >
          <Icon name="close" size={13} />
        </button>
      </div>
    );
  }
  function group(criteria: Criteria, index: number, preferred = false) {
    const values = chips(criteria);
    return (
      <div
        className={styles.filterGroup}
        key={`${preferred}:${index}`}
        role="group"
        aria-labelledby={`requirement-group-${preferred}-${index}`}
      >
        <span
          className={
            !preferred &&
            filters.anyOf.length === 1 &&
            !filters.preferred.length
              ? styles.srOnly
              : styles.groupLabel
          }
          id={`requirement-group-${preferred}-${index}`}
        >
          {preferred
            ? `Nice to have${filters.preferred.length > 1 ? ` ${index + 1}` : ""}`
            : filters.anyOf.length > 1
              ? `${index ? "Or " : ""}Accepted set ${index + 1}`
              : "Required"}
        </span>
        <div className={styles.chips}>
          {values.map((chip, chipIndex) =>
            renderChip(chip, index, preferred, `${chip.label}:${chipIndex}`),
          )}
          {!values.length && (
            <span className={styles.trust}>No supported requirements.</span>
          )}
        </div>
      </div>
    );
  }
  return (
    <Tooltip.Provider delayDuration={200}>
      {filters.anyOf.map((criteria, index) => group(criteria, index))}
      {filters.preferred.map((criteria, index) => group(criteria, index, true))}
      {filters.issues.map((issue, index) => (
        <div className={styles.issue} key={`${issue.text}:${index}`}>
          <p>
            <strong>{requirementLabel(issue)}</strong>
            <span>{requirementExplanation(issue)}</span>
          </p>
          <button
            type="button"
            aria-label={`Continue without ${requirementLabel(issue)}`}
            disabled={disabled}
            onClick={() => onRemoveRequirement(index)}
          >
            Continue without it
          </button>
        </div>
      ))}
    </Tooltip.Provider>
  );
}
