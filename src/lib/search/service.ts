import "server-only";

import { createHash } from "node:crypto";
import { ApiError, type RecruiterContext } from "@/lib/api";
import {
  beginSearch,
  completeSearch,
  failSearch,
  getPlan,
  SearchDatabaseError,
  type SearchDatabaseErrorCode,
} from "@/lib/data/search-execution";
import { interpretBrief, assertGeminiConfigured, GeminiError } from "./gemini";
import {
  SEARCH_PAGE_SIZE,
  type SearchPageRows,
  type SearchResponse,
} from "./contracts";
import { readSearchPage } from "@/lib/data/search-results";
import { validateSearchFilters, type SearchFilters } from "./schema";

const databaseErrorStatuses: Record<SearchDatabaseErrorCode, number> = {
  quota: 402,
  pending: 409,
  conflict: 409,
  stale: 409,
  not_found: 404,
  invalid: 400,
  unavailable: 503,
};

function searchError(error: unknown): never {
  if (error instanceof SearchDatabaseError) {
    throw new ApiError(
      databaseErrorStatuses[error.code],
      `SEARCH_${error.code.toUpperCase()}`,
      error.message,
    );
  }
  if (error instanceof GeminiError) {
    const timeout = error.code === "timeout";
    throw new ApiError(
      timeout ? 504 : 503,
      `INTERPRETATION_${error.code.toUpperCase()}`,
      error.code === "configuration"
        ? "Gemini is not configured. Add GEMINI_API_KEY on the server."
        : timeout
          ? "Interpreting the brief took too long. Your search allowance was not used."
          : "We couldn't interpret this brief reliably. Your search allowance was not used. Please try again.",
    );
  }
  throw error;
}

export function requestKey(request: Request): string | null {
  const key = request.headers.get("idempotency-key");
  if (key !== null && !/^[a-zA-Z0-9_-]{8,100}$/.test(key)) {
    throw new ApiError(
      400,
      "INVALID_REQUEST_KEY",
      "Use a valid Idempotency-Key between 8 and 100 characters.",
    );
  }
  return key;
}

export async function planFor(context: RecruiterContext) {
  try {
    return await getPlan(context.recruiter.id);
  } catch (error) {
    searchError(error);
  }
}

function requireSearchPage<T extends { status: string; total: number }>(
  search: T | undefined,
  page: number,
): T {
  if (!search)
    throw new ApiError(404, "NOT_FOUND", "This search was not found.");
  if (search.status === "pending")
    throw new ApiError(
      409,
      "SEARCH_PENDING",
      "This search is still in progress.",
    );
  if (search.status === "failed")
    throw new ApiError(
      409,
      "SEARCH_FAILED",
      "This search did not complete. Please try again.",
    );
  if (page > Math.max(1, Math.ceil(search.total / SEARCH_PAGE_SIZE))) {
    throw new ApiError(
      404,
      "PAGE_NOT_FOUND",
      "This search has no results on that page.",
    );
  }
  return search;
}

export async function readSearchRows(
  context: RecruiterContext,
  id: string,
  page: number,
): Promise<SearchPageRows> {
  const search = requireSearchPage(
    await readSearchPage(context.recruiter.id, id, page, "rows"),
    page,
  );
  return {
    search_id: search.id,
    total: search.total,
    results: search.results,
    page,
  };
}

export async function readSearch(
  context: RecruiterContext,
  id: string,
  page = 1,
): Promise<SearchResponse> {
  const search = requireSearchPage(
    await readSearchPage(context.recruiter.id, id, page, "full"),
    page,
  );
  const filters = validateSearchFilters(search.filters);
  if (!filters) throw new Error("Stored search filters are invalid");
  return {
    search_id: search.id,
    brief: search.brief,
    filters,
    total: search.total,
    results: search.results,
    page,
    searches_remaining: search.searches_remaining,
  };
}

export async function executeSearch(
  context: RecruiterContext,
  brief: string,
  key: string | null,
  suppliedFilters?: SearchFilters,
) {
  try {
    if (!suppliedFilters) assertGeminiConfigured();
  } catch (error) {
    searchError(error);
  }
  const hash = createHash("sha256")
    .update(JSON.stringify({ brief, filters: suppliedFilters ?? null }))
    .digest("hex");
  let reservation: Awaited<ReturnType<typeof beginSearch>>;
  try {
    reservation = await beginSearch(context.recruiter.id, brief, key, hash);
  } catch (error) {
    searchError(error);
  }
  if (reservation.replayed && reservation.status === "completed")
    return readSearch(context, reservation.searchId);
  try {
    const filters = validateSearchFilters(
      suppliedFilters ?? (await interpretBrief(brief)),
    );
    if (!filters)
      throw new ApiError(
        400,
        "INVALID_FILTERS",
        "Choose valid search filters.",
      );
    await completeSearch(
      context.recruiter.id,
      reservation.searchId,
      reservation.attemptId,
      filters,
    );
  } catch (error) {
    try {
      await failSearch(
        context.recruiter.id,
        reservation.searchId,
        reservation.attemptId,
        "Search did not complete",
      );
    } catch {
      /* The lease also recovers a crashed or unavailable cleanup. */
    }
    searchError(error);
  }
  return readSearch(context, reservation.searchId);
}
