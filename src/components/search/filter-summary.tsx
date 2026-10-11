import type { SearchFilters } from "@/lib/search/schema";
import { Icon } from "./icon";
import styles from "./search-workspace.module.css";
import { humanize } from "./requirement-editor-model";

type Criteria = SearchFilters["anyOf"][number];
type Chip = { label: string; remove: (criteria: Criteria) => void };

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
    values?.forEach((value, index) =>
      result.push({
        label: `${label}: ${key.toLowerCase().includes("senior") ? title(value) : value}`,
        remove(next) {
          const remaining = (next[key] as string[]).filter(
            (_, i) => i !== index,
          );
          if (remaining.length) Object.assign(next, { [key]: remaining });
          else delete next[key];
        },
      }),
    );
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
        label: `${key === "excludeLocations" ? "Exclude Location" : "Location"}: ${[location.city, location.state, location.country ? humanize(location.country) : undefined].filter(Boolean).join(", ")}`,
        remove(next) {
          next[key] = next[key]?.filter((_, i) => i !== index);
          if (!next[key]?.length) delete next[key];
        },
      }),
    );
  }
  criteria.experience?.forEach((experience, index) =>
    result.push({
      label: `${experience.exclude ? "Exclude work history" : "Worked at"}: ${[...(experience.companyTypes ?? []).map(humanize), ...(experience.companies ?? []), ...(experience.titles ?? []), humanize(experience.scope)].join(" · ")}`,
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
          className={styles.groupLabel}
          id={`requirement-group-${preferred}-${index}`}
        >
          {preferred
            ? `Nice to have${filters.preferred.length > 1 ? ` ${index + 1}` : ""}`
            : filters.anyOf.length > 1
              ? `${index ? "Or " : ""}Accepted set ${index + 1}`
              : "Must match"}
        </span>
        <div className={styles.chips}>
          {values.map((chip, chipIndex) => (
            <div
              className={styles.chip}
              data-preferred={preferred}
              key={`${chip.label}:${chipIndex}`}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={onEdit}
                aria-label={`Edit ${chip.label}`}
              >
                {chip.label}
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${chip.label}`}
                onClick={() => {
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
                }}
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          ))}
          {!values.length && (
            <span className={styles.trust}>No supported requirements.</span>
          )}
        </div>
      </div>
    );
  }
  return (
    <>
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
    </>
  );
}
