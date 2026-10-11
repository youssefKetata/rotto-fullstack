import type { SavedBrief } from "./contracts";

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, item]) => [key, ordered(item)]),
    );
  }
  return value;
}

// Match PostgreSQL jsonb equality, regardless of object property order.
export function savedSearchKey(search: Pick<SavedBrief, "brief" | "filters">) {
  return JSON.stringify([search.brief.trim(), ordered(search.filters)]);
}
