import { SEARCH_PAGE_SIZE, type SearchPageRows } from "@/lib/search/contracts";

type Page<Person> = Omit<SearchPageRows, "results"> & { results: Person[] };

export function appendSearchPage<Person extends { id: string }>(
  current: Page<Person>,
  incoming: Page<Person>,
): Page<Person> {
  const remaining = current.total - current.results.length;
  const ids = new Set(current.results.map(({ id }) => id));
  if (
    incoming.search_id !== current.search_id ||
    incoming.page !== current.page + 1 ||
    incoming.total !== current.total ||
    remaining <= 0 ||
    incoming.results.length !== Math.min(remaining, SEARCH_PAGE_SIZE)
  ) {
    throw new Error(
      "The next page did not match this search. Please try again.",
    );
  }
  for (const { id } of incoming.results) {
    if (ids.has(id)) {
      throw new Error("The next page repeated a candidate. Please try again.");
    }
    ids.add(id);
  }
  return {
    ...current,
    page: incoming.page,
    results: [...current.results, ...incoming.results],
  };
}
