import vocabulary from "./vocabulary.json";
import type { Filters } from "./types";

export { vocabulary };

function mentions(text: string, value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(text);
}

// A temporary, deliberately labelled keyword preview. Replace with validated
// model interpretation at the search API boundary; this never calls a model.
export function previewBrief(brief: string): {
  filters: Filters;
  unsupported: string[];
} {
  const filters: Filters = { skills: [] };
  const roles = vocabulary.roles.filter(
    (role) =>
      mentions(brief, role) || mentions(brief, role.replace(/ Engineer$/, "")),
  );
  if (roles.length === 1) filters.role = roles[0];
  for (const seniority of ["junior", "mid", "senior", "staff"] as const) {
    if (mentions(brief, seniority)) filters.seniority = seniority;
  }
  // Prefer the specific skill over its prefix (React Native vs React).
  const found = vocabulary.skills.filter((skill) => mentions(brief, skill));
  filters.skills = found.filter(
    (skill) =>
      !found.some((other) => other !== skill && other.startsWith(`${skill} `)),
  );
  if (mentions(brief, "PostgreSQL") && !filters.skills.includes("Postgres"))
    filters.skills.push("Postgres");
  const years = /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i.exec(brief);
  if (years) filters.minYears = Number(years[1]);
  const cities = vocabulary.cities.filter((city) => mentions(brief, city));
  if (cities.length === 1) filters.city = cities[0];
  const stateNames: Record<string, string> = {
    Texas: "TX",
    California: "CA",
    Massachusetts: "MA",
    Colorado: "CO",
    Florida: "FL",
    Georgia: "GA",
    Illinois: "IL",
    Washington: "WA",
  };
  const state = Object.entries(stateNames).find(([name]) =>
    mentions(brief, name),
  );
  if (state) filters.state = state[1];
  if (/\bopen to work\b/i.test(brief)) filters.openToWork = true;
  if (mentions(brief, "startup")) filters.companyType = "startup";
  if (mentions(brief, "enterprise")) filters.companyType = "enterprise";
  const field = vocabulary.fields.find((value) => mentions(brief, value));
  if (field) filters.field = field;
  const unsupported = [
    "remote",
    "salary",
    "contact",
    "culture fit",
    "visa",
    "relocation",
  ].filter((value) => mentions(brief, value));
  if (roles.length > 1 || cities.length > 1)
    unsupported.push("multiple roles or locations");
  if (/\b(?:not|without|except|or)\b/i.test(brief))
    unsupported.push("alternatives or exclusions");
  return { filters, unsupported };
}

export function filterChips(
  filters: Filters,
): { key: keyof Filters; label: string; skill?: string }[] {
  return [
    ...(filters.role ? [{ key: "role" as const, label: filters.role }] : []),
    ...(filters.seniority
      ? [
          {
            key: "seniority" as const,
            label:
              filters.seniority === "mid"
                ? "Mid-level"
                : filters.seniority[0].toUpperCase() +
                  filters.seniority.slice(1),
          },
        ]
      : []),
    ...filters.skills.map((skill) => ({
      key: "skills" as const,
      label: skill,
      skill,
    })),
    ...(filters.minYears !== undefined
      ? [{ key: "minYears" as const, label: `${filters.minYears}+ years` }]
      : []),
    ...(filters.city ? [{ key: "city" as const, label: filters.city }] : []),
    ...(filters.state ? [{ key: "state" as const, label: filters.state }] : []),
    ...(filters.openToWork
      ? [{ key: "openToWork" as const, label: "Open to work" }]
      : []),
    ...(filters.companyType
      ? [
          {
            key: "companyType" as const,
            label: `${filters.companyType === "startup" ? "Startup" : "Enterprise"} experience`,
          },
        ]
      : []),
    ...(filters.field ? [{ key: "field" as const, label: filters.field }] : []),
  ];
}

export function validateFilters(value: unknown): Filters | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const f = value as Record<string, unknown>;
  const allowed = [
    "role",
    "seniority",
    "skills",
    "minYears",
    "city",
    "state",
    "openToWork",
    "companyType",
    "field",
  ];
  if (Object.keys(f).some((key) => !allowed.includes(key))) return null;
  if (
    !Array.isArray(f.skills) ||
    f.skills.length > vocabulary.skills.length ||
    f.skills.some(
      (s) => typeof s !== "string" || !vocabulary.skills.includes(s),
    )
  )
    return null;
  for (const [key, values] of Object.entries({
    role: vocabulary.roles,
    city: vocabulary.cities,
    state: vocabulary.states,
    field: vocabulary.fields,
    seniority: ["junior", "mid", "senior", "staff"],
    companyType: ["startup", "enterprise"],
  })) {
    if (
      f[key] !== undefined &&
      (typeof f[key] !== "string" || !values.includes(f[key] as string))
    )
      return null;
  }
  if (f.openToWork !== undefined && f.openToWork !== true) return null;
  if (
    f.minYears !== undefined &&
    (typeof f.minYears !== "number" ||
      !Number.isInteger(f.minYears) ||
      f.minYears < 0 ||
      f.minYears > 60)
  )
    return null;
  return { ...f, skills: [...new Set(f.skills)] } as Filters;
}
