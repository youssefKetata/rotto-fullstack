import type { SearchFilters } from "./schema";
import type { Candidate } from "./types";

/** Shared API contracts contain no server code or credentials. */
export type CompanyPlan = {
  plan: "free" | "paid";
  searches_remaining: number | null;
};

export type SearchResponse = {
  search_id: string;
  brief: string;
  filters: SearchFilters;
  total: number;
  results: Candidate[];
  searches_remaining: number | null;
  page: number;
};

export type Shortlist = {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
};

export type ShortlistMembership = {
  candidate_id: string;
  added_at: string;
  added_by: string;
};
export type ShortlistDetail = Shortlist & {
  people: Candidate[];
  memberships: ShortlistMembership[];
};

export type SavedBrief = {
  id: string;
  brief: string;
  filters: SearchFilters;
  created_at?: string;
  name?: string | null;
  last_search_id?: string | null;
  last_result_count?: number | null;
  last_searched_at?: string | null;
};

export const SEARCH_PAGE_SIZE = 20;
