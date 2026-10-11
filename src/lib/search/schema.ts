import baseVocabulary from "./vocabulary.json";
import historyVocabulary from "./history-vocabulary.json";

export type Seniority = "junior" | "mid" | "senior" | "staff";
export type CompanyType = "startup" | "enterprise";

export type SearchLocation = {
  city?: string;
  state?: string;
  country?: string;
};

export type SearchExperience = {
  scope: "any" | "current" | "past";
  companyTypes?: CompanyType[];
  companies?: string[];
  titles?: string[];
  exclude?: boolean;
};

export type SearchEducation = {
  degrees?: string[];
  schools?: string[];
  fields?: string[];
  minGraduationYear?: number;
  maxGraduationYear?: number;
  exclude?: boolean;
};

/** Fields within a criterion are ANDed; values in roles/locations are alternatives. */
export type SearchCriteria = {
  roles?: string[];
  excludeRoles?: string[];
  seniorities?: Seniority[];
  excludeSeniorities?: Seniority[];
  skillsAll?: string[];
  skillsAny?: string[];
  skillsNone?: string[];
  minYears?: number;
  maxYears?: number;
  locations?: SearchLocation[];
  excludeLocations?: SearchLocation[];
  openToWork?: boolean;
  experience?: SearchExperience[];
  education?: SearchEducation[];
};

export type SearchIssue = {
  text: string;
  kind: "unsupported" | "ambiguous" | "contradictory";
  required: boolean;
};

/** OR branches select people. Preferences only rank. Required issues force no matches. */
export type SearchFilters = {
  version: 1;
  anyOf: SearchCriteria[];
  preferred: SearchCriteria[];
  issues: SearchIssue[];
};

export const SEARCH_LIMITS = {
  maxBranches: 4,
  maxCriteria: 20,
  maxIssues: 20,
  maxBriefLength: 4000,
} as const;

// This contains distinct field values, never people, IDs, profiles or descriptions.
export const searchVocabulary = {
  ...baseVocabulary,
  ...historyVocabulary,
  seniorities: ["junior", "mid", "senior", "staff"] as Seniority[],
  companyTypes: ["startup", "enterprise"] as CompanyType[],
};

export const searchAliases: Record<string, Record<string, string>> = {
  skills: {
    postgresql: "Postgres",
    golang: "Go",
    nodejs: "Node.js",
    "node js": "Node.js",
    reactjs: "React",
    "react.js": "React",
    nextjs: "Next.js",
    "next js": "Next.js",
    rails: "Ruby on Rails",
  },
  cities: { nyc: "New York", sf: "San Francisco", la: "Los Angeles" },
  states: {
    california: "CA",
    colorado: "CO",
    florida: "FL",
    georgia: "GA",
    illinois: "IL",
    massachusetts: "MA",
    "new york": "NY",
    texas: "TX",
    washington: "WA",
  },
  countries: {
    usa: "US",
    "united states": "US",
    "united states of america": "US",
  },
  schools: {
    stanford: "Stanford University",
    berkeley: "UC Berkeley",
    "university of california berkeley": "UC Berkeley",
    "massachusetts institute of technology": "MIT",
    nyu: "New York University",
    "georgia institute of technology": "Georgia Tech",
  },
  degrees: { doctorate: "PhD", "ph.d.": "PhD", "ph.d": "PhD" },
};

const criteriaKeys = new Set([
  "roles",
  "excludeRoles",
  "seniorities",
  "excludeSeniorities",
  "skillsAll",
  "skillsAny",
  "skillsNone",
  "minYears",
  "maxYears",
  "locations",
  "excludeLocations",
  "openToWork",
  "experience",
  "education",
]);

type Dictionary = Record<string, unknown>;

function record(value: unknown, keys: Set<string>): value is Dictionary {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null) &&
    Object.keys(value).every((key) => keys.has(key))
  );
}

function canonical(
  value: unknown,
  vocabulary: readonly string[],
  aliases?: Record<string, string>,
) {
  if (typeof value !== "string" || value.length > 160) return null;
  const lowered = value.trim().toLowerCase();
  return (
    vocabulary.find((item) => item.toLowerCase() === lowered) ??
    (aliases && Object.hasOwn(aliases, lowered) ? aliases[lowered] : null)
  );
}

function values(
  value: unknown,
  vocabulary: readonly string[],
  aliases?: Record<string, string>,
) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > SEARCH_LIMITS.maxCriteria
  )
    return null;
  const parsed = value.map((item) => canonical(item, vocabulary, aliases));
  return parsed.some((item) => item === null)
    ? null
    : [...new Set(parsed as string[])];
}

function integer(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}

function overlaps(first: string[] | undefined, second: string[] | undefined) {
  return first?.some((value) => second?.includes(value)) ?? false;
}

function entirelyExcluded(
  first: string[] | undefined,
  second: string[] | undefined,
) {
  return !!first?.length && first.every((value) => second?.includes(value));
}

function parseLocation(value: unknown): SearchLocation | null {
  if (
    !record(value, new Set(["city", "state", "country"])) ||
    !Object.keys(value).length
  )
    return null;
  const result: SearchLocation = {};
  for (const [key, vocabulary, aliases] of [
    ["city", searchVocabulary.cities, searchAliases.cities],
    ["state", searchVocabulary.states, searchAliases.states],
    ["country", searchVocabulary.countries, searchAliases.countries],
  ] as const) {
    if (key in value) {
      const parsed = canonical(value[key], vocabulary, aliases);
      if (!parsed) return null;
      result[key] = parsed;
    }
  }
  // A city and state must describe a real tuple, rather than an impossible location.
  return historyVocabulary.locations.some((location) =>
    locationMatches(location, result),
  )
    ? result
    : null;
}

function locationMatches(location: SearchLocation, condition: SearchLocation) {
  return Object.entries(condition).every(
    ([key, value]) => location[key as keyof SearchLocation] === value,
  );
}

function arrayOf<T>(
  value: unknown,
  parse: (item: unknown) => T | null,
): T[] | null {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > SEARCH_LIMITS.maxCriteria
  )
    return null;
  const result = value.map(parse);
  if (result.some((item) => item === null)) return null;
  return [
    ...new Map(
      result.map((item) => [JSON.stringify(item), item as T]),
    ).values(),
  ];
}

function parseExperience(value: unknown): SearchExperience | null {
  if (
    !record(
      value,
      new Set(["scope", "companyTypes", "companies", "titles", "exclude"]),
    )
  )
    return null;
  if (
    value.scope !== "any" &&
    value.scope !== "current" &&
    value.scope !== "past"
  )
    return null;
  const result: SearchExperience = { scope: value.scope };
  for (const [key, vocabulary] of [
    ["companyTypes", searchVocabulary.companyTypes],
    ["companies", searchVocabulary.companies],
    ["titles", searchVocabulary.titles],
  ] as const) {
    if (key in value) {
      const parsed = values(value[key], vocabulary);
      if (!parsed) return null;
      if (key === "companyTypes") result.companyTypes = parsed as CompanyType[];
      else result[key] = parsed;
    }
  }
  if ("exclude" in value) {
    if (typeof value.exclude !== "boolean") return null;
    result.exclude = value.exclude;
  }
  // "Any experience" alone carries no useful condition in this dataset.
  return result.scope !== "any" ||
    result.companyTypes ||
    result.companies ||
    result.titles
    ? result
    : null;
}

function parseEducation(value: unknown): SearchEducation | null {
  if (
    !record(
      value,
      new Set([
        "degrees",
        "schools",
        "fields",
        "minGraduationYear",
        "maxGraduationYear",
        "exclude",
      ]),
    )
  )
    return null;
  const result: SearchEducation = {};
  for (const [key, vocabulary, aliases] of [
    ["degrees", searchVocabulary.degrees, searchAliases.degrees],
    ["schools", searchVocabulary.schools, searchAliases.schools],
    ["fields", searchVocabulary.fields, undefined],
  ] as const) {
    if (key in value) {
      const parsed = values(value[key], vocabulary, aliases);
      if (!parsed) return null;
      result[key] = parsed;
    }
  }
  for (const key of ["minGraduationYear", "maxGraduationYear"] as const) {
    if (key in value) {
      if (!integer(value[key], 1900, 2100)) return null;
      result[key] = value[key];
    }
  }
  if ("exclude" in value) {
    if (typeof value.exclude !== "boolean") return null;
    result.exclude = value.exclude;
  }
  if (
    result.minGraduationYear !== undefined &&
    result.maxGraduationYear !== undefined &&
    result.minGraduationYear > result.maxGraduationYear
  )
    return null;
  return Object.keys(result).some((key) => key !== "exclude") ? result : null;
}

function experienceExcludes(
  required: SearchExperience,
  excluded: SearchExperience,
) {
  return (
    excluded.exclude &&
    (excluded.scope === "any" || required.scope === excluded.scope) &&
    (["companyTypes", "companies", "titles"] as const).every(
      (key) => !excluded[key] || entirelyExcluded(required[key], excluded[key]),
    )
  );
}

function educationExcludes(
  required: SearchEducation,
  excluded: SearchEducation,
) {
  return (
    excluded.exclude &&
    (["degrees", "schools", "fields"] as const).every(
      (key) => !excluded[key] || entirelyExcluded(required[key], excluded[key]),
    ) &&
    (excluded.minGraduationYear === undefined ||
      (required.minGraduationYear !== undefined &&
        required.minGraduationYear >= excluded.minGraduationYear)) &&
    (excluded.maxGraduationYear === undefined ||
      (required.maxGraduationYear !== undefined &&
        required.maxGraduationYear <= excluded.maxGraduationYear))
  );
}

function parseCriteria(value: unknown): SearchCriteria | null {
  if (!record(value, criteriaKeys) || !Object.keys(value).length) return null;
  const result: SearchCriteria = {};
  for (const [key, vocabulary, aliases] of [
    ["roles", searchVocabulary.roles, undefined],
    ["excludeRoles", searchVocabulary.roles, undefined],
    ["seniorities", searchVocabulary.seniorities, undefined],
    ["excludeSeniorities", searchVocabulary.seniorities, undefined],
    ["skillsAll", searchVocabulary.skills, searchAliases.skills],
    ["skillsAny", searchVocabulary.skills, searchAliases.skills],
    ["skillsNone", searchVocabulary.skills, searchAliases.skills],
  ] as const) {
    if (key in value) {
      const parsed = values(value[key], vocabulary, aliases);
      if (!parsed) return null;
      if (key === "seniorities" || key === "excludeSeniorities")
        result[key] = parsed as Seniority[];
      else result[key] = parsed;
    }
  }
  for (const key of ["minYears", "maxYears"] as const) {
    if (key in value) {
      if (!integer(value[key], 0, 60)) return null;
      result[key] = value[key];
    }
  }
  for (const key of ["locations", "excludeLocations"] as const) {
    if (key in value) {
      const parsed = arrayOf(value[key], parseLocation);
      if (!parsed) return null;
      result[key] = parsed;
    }
  }
  if ("openToWork" in value) {
    if (typeof value.openToWork !== "boolean") return null;
    result.openToWork = value.openToWork;
  }
  if ("experience" in value) {
    const parsed = arrayOf(value.experience, parseExperience);
    if (!parsed) return null;
    result.experience = parsed;
  }
  if ("education" in value) {
    const parsed = arrayOf(value.education, parseEducation);
    if (!parsed) return null;
    result.education = parsed;
  }
  if (
    entirelyExcluded(result.roles, result.excludeRoles) ||
    entirelyExcluded(result.seniorities, result.excludeSeniorities) ||
    overlaps(result.skillsAll, result.skillsNone) ||
    entirelyExcluded(result.skillsAny, result.skillsNone) ||
    (result.minYears !== undefined &&
      result.maxYears !== undefined &&
      result.minYears > result.maxYears)
  )
    return null;
  if (
    result.locations &&
    !historyVocabulary.locations.some(
      (location) =>
        result.locations!.some((condition) =>
          locationMatches(location, condition),
        ) &&
        !result.excludeLocations?.some((condition) =>
          locationMatches(location, condition),
        ),
    )
  )
    return null;
  if (
    result.experience?.some(
      (required) =>
        !required.exclude &&
        result.experience!.some((excluded) =>
          experienceExcludes(required, excluded),
        ),
    )
  )
    return null;
  if (
    result.education?.some(
      (required) =>
        !required.exclude &&
        result.education!.some((excluded) =>
          educationExcludes(required, excluded),
        ),
    )
  )
    return null;
  return result;
}

function criterionCount(criteria: SearchCriteria): number {
  return Object.entries(criteria).reduce((total, [key, value]) => {
    if (key === "experience" || key === "education") {
      return (
        total +
        (value as (SearchExperience | SearchEducation)[]).reduce(
          (sum, row) =>
            sum +
            Object.entries(row).reduce(
              (count, [field, item]) =>
                count +
                (field === "exclude"
                  ? 0
                  : Array.isArray(item)
                    ? item.length
                    : 1),
              0,
            ),
          0,
        )
      );
    }
    if (key === "locations" || key === "excludeLocations")
      return total + (value as SearchLocation[]).length;
    return total + (Array.isArray(value) ? value.length : 1);
  }, 0);
}

/** Closed-schema validation is shared by model output and editable/saved filters. */
export function validateSearchFilters(value: unknown): SearchFilters | null {
  if (
    !record(value, new Set(["version", "anyOf", "preferred", "issues"])) ||
    value.version !== 1
  )
    return null;
  if (
    !Array.isArray(value.anyOf) ||
    value.anyOf.length > SEARCH_LIMITS.maxBranches ||
    !Array.isArray(value.preferred) ||
    value.preferred.length > SEARCH_LIMITS.maxCriteria ||
    !Array.isArray(value.issues) ||
    value.issues.length > SEARCH_LIMITS.maxIssues
  )
    return null;
  const anyOf = value.anyOf.map(parseCriteria);
  const preferred = value.preferred.map(parseCriteria);
  if (
    anyOf.some((item) => item === null) ||
    preferred.some((item) => item === null)
  )
    return null;
  const criteria = [...anyOf, ...preferred] as SearchCriteria[];
  if (
    criteria.reduce((sum, item) => sum + criterionCount(item), 0) >
    SEARCH_LIMITS.maxCriteria
  )
    return null;
  const issues: SearchIssue[] = [];
  for (const issue of value.issues) {
    if (
      !record(issue, new Set(["text", "kind", "required"])) ||
      typeof issue.text !== "string" ||
      !issue.text.trim() ||
      issue.text.length > 300 ||
      !["unsupported", "ambiguous", "contradictory"].includes(
        issue.kind as string,
      ) ||
      typeof issue.required !== "boolean"
    )
      return null;
    issues.push({
      text: issue.text.trim(),
      kind: issue.kind as SearchIssue["kind"],
      required: issue.required,
    });
  }
  return {
    version: 1,
    anyOf: anyOf as SearchCriteria[],
    preferred: preferred as SearchCriteria[],
    issues,
  };
}
