import type { SearchCriteria, SearchFilters } from "@/lib/search/schema";

export type TokenState = "required" | "preferred" | "exclude";
export type TokenRef = {
  group: "anyOf" | "preferred";
  index: number;
  key: keyof SearchCriteria;
  valueIndex?: number;
};
export const stateLabels = {
  required: "Required",
  preferred: "Nice to have",
  exclude: "Exclude",
};
export const humanize = (value: string) =>
  ({
    mid: "Mid-level",
    junior: "Junior",
    senior: "Senior",
    staff: "Staff",
    startup: "Startup",
    enterprise: "Enterprise",
    any: "Any job",
    current: "Current job",
    past: "Past job",
    US: "United States",
  })[value] ?? value;

const exclusions: Partial<Record<keyof SearchCriteria, keyof SearchCriteria>> =
  {
    roles: "excludeRoles",
    seniorities: "excludeSeniorities",
    skillsAll: "skillsNone",
    skillsAny: "skillsNone",
    locations: "excludeLocations",
  };
const positives: Partial<Record<keyof SearchCriteria, keyof SearchCriteria>> = {
  excludeRoles: "roles",
  excludeSeniorities: "seniorities",
  skillsNone: "skillsAll",
  excludeLocations: "locations",
};

export function tokenValue(filters: SearchFilters, ref: TokenRef): unknown {
  const value = filters[ref.group][ref.index]?.[ref.key];
  return ref.valueIndex === undefined
    ? value
    : (value as unknown[])?.[ref.valueIndex];
}

export function tokenIsExcluded(filters: SearchFilters, ref: TokenRef) {
  const value = tokenValue(filters, ref);
  return (
    !!positives[ref.key] ||
    (ref.key === "openToWork" && value === false) ||
    (!!value &&
      typeof value === "object" &&
      "exclude" in value &&
      !!value.exclude)
  );
}

export function tokenState(filters: SearchFilters, ref: TokenRef): TokenState {
  return ref.group === "preferred"
    ? "preferred"
    : tokenIsExcluded(filters, ref)
      ? "exclude"
      : "required";
}

export function canExclude(ref: TokenRef) {
  return (
    !!exclusions[ref.key] ||
    !!positives[ref.key] ||
    ["experience", "education", "openToWork"].includes(ref.key)
  );
}

function deleteValue(filters: SearchFilters, ref: TokenRef) {
  const criteria = filters[ref.group][ref.index];
  if (ref.valueIndex === undefined) delete criteria[ref.key];
  else {
    const values = (criteria[ref.key] as unknown[]).filter(
      (_, index) => index !== ref.valueIndex,
    );
    if (values.length) Object.assign(criteria, { [ref.key]: values });
    else delete criteria[ref.key];
  }
}

export function removeEditorToken(filters: SearchFilters, ref: TokenRef) {
  const next = structuredClone(filters);
  deleteValue(next, ref);
  next.preferred = next.preferred.filter(
    (criteria) => Object.keys(criteria).length,
  );
  return next;
}

export function removeEditorTokens(filters: SearchFilters, refs: TokenRef[]) {
  // Remove later indices first so array and preference indices stay stable.
  const ordered = [...refs].sort(
    (a, b) =>
      a.group.localeCompare(b.group) ||
      b.index - a.index ||
      (b.valueIndex ?? -1) - (a.valueIndex ?? -1),
  );
  return ordered.reduce(removeEditorToken, filters);
}

/** Moves only the selected value; untouched compound rules keep their original semantics. */
export function changeTokenState(
  filters: SearchFilters,
  ref: TokenRef,
  state: TokenState,
  branch: number,
  skillMode: "all" | "any",
) {
  if (state === tokenState(filters, ref)) return filters;
  if (state === "exclude" && !canExclude(ref)) return filters;
  let value = structuredClone(tokenValue(filters, ref));
  let key = positives[ref.key] ?? ref.key;
  if (key === "skillsAll" || key === "skillsAny")
    key = skillMode === "any" ? "skillsAny" : "skillsAll";
  if (key === "experience" || key === "education") {
    value = { ...(value as object) };
    delete (value as { exclude?: boolean }).exclude;
    if (state === "exclude") (value as { exclude?: boolean }).exclude = true;
  } else if (key === "openToWork" && state !== "preferred") {
    if (state === "exclude") value = ref.group === "preferred" ? !value : false;
    else if (ref.group === "anyOf" && value === false) value = true;
  } else if (state === "exclude") key = exclusions[key] ?? key;
  const next = removeEditorToken(filters, ref);
  const fragment: SearchCriteria = {};
  Object.assign(fragment, {
    [key]: ref.valueIndex === undefined ? value : [value],
  });
  if (state === "preferred") next.preferred.push(fragment);
  else {
    next.anyOf[branch] ??= {};
    const target = next.anyOf[branch];
    const current = target[key];
    if (Array.isArray(current))
      Object.assign(target, { [key]: [...current, value] });
    else Object.assign(target, fragment);
  }
  return next;
}

export function setSkillMode(
  filters: SearchFilters,
  branch: number,
  mode: "all" | "any",
) {
  const next = structuredClone(filters);
  const criteria = next.anyOf[branch];
  if (!criteria) return next;
  const values = [
    ...new Set([...(criteria.skillsAll ?? []), ...(criteria.skillsAny ?? [])]),
  ];
  delete criteria.skillsAll;
  delete criteria.skillsAny;
  if (values.length)
    criteria[mode === "all" ? "skillsAll" : "skillsAny"] = values;
  return next;
}

export function locationLabel(value: {
  city?: string;
  state?: string;
  country?: string;
}) {
  return [
    value.city,
    value.state,
    value.country ? humanize(value.country) : undefined,
  ]
    .filter(Boolean)
    .join(", ");
}
