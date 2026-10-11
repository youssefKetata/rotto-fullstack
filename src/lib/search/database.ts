import "server-only";

import { getDatabase, type DatabaseTransaction } from "@/lib/database";
import type { CompanyPlan } from "./contracts";
import { matchingCandidates } from "./query";
import { validateSearchFilters, type SearchFilters } from "./schema";

export type { CompanyPlan } from "./contracts";
export type SearchDatabaseErrorCode =
  | "quota"
  | "pending"
  | "conflict"
  | "stale"
  | "not_found"
  | "invalid"
  | "unavailable";
const errorMessages: Record<SearchDatabaseErrorCode, string> = {
  quota:
    "Your company's free search is used or already in progress. Upgrade to run another search.",
  pending: "This search is still in progress. Please try again shortly.",
  conflict: "This request key was already used for a different search.",
  stale: "This search attempt expired. Please try again.",
  not_found: "This search was not found.",
  invalid: "The search filters are invalid.",
  unavailable: "Search is unavailable. Please try again.",
};
export class SearchDatabaseError extends Error {
  constructor(
    public readonly code: SearchDatabaseErrorCode,
    options?: ErrorOptions,
  ) {
    super(errorMessages[code], options);
    this.name = "SearchDatabaseError";
  }
}
export type SearchExecution = {
  searchId: string;
  attemptId: string;
  replayed: boolean;
  status: "pending" | "completed" | "failed";
};
type Usage = {
  company_id: string;
  free_searches_used: number;
  reserved_search_id: string | null;
  reservation_expires_at: Date | null;
};
type Execution = {
  search_id: string;
  company_id: string;
  request_hash: string;
  attempt_id: string;
  lease_expires_at: Date;
  status: SearchExecution["status"];
};
type Failure = { error: SearchDatabaseErrorCode };

// The verified recruiter ID comes from server authentication, never request data.
// Hold membership stable and serialize quota/billing changes through the company row.
async function transaction<T extends object>(
  recruiterId: string,
  action: (
    sql: DatabaseTransaction,
    usage: Usage,
    now: Date,
  ) => Promise<T | Failure>,
): Promise<T> {
  try {
    const result = await getDatabase().begin(
      async (sql): Promise<T | Failure> => {
        const [recruiter] = await sql<{ company_id: string }[]>`
        select company_id from public.recruiters where id = ${recruiterId} for share`;
        if (!recruiter) return { error: "not_found" };
        await sql`insert into private.company_usage(company_id) values (${recruiter.company_id}) on conflict do nothing`;
        const [usage] = await sql<
          Usage[]
        >`select * from private.company_usage where company_id = ${recruiter.company_id} for update`;
        const [clock] = await sql<
          { now: Date }[]
        >`select clock_timestamp() as now`;
        return action(sql, usage, clock.now);
      },
    );
    // Expected failures can commit lease cleanup before becoming an HTTP error.
    if ("error" in result) throw new SearchDatabaseError(result.error);
    // postgres.js's generic result type also supports arrays; our actions return objects.
    return result as T;
  } catch (error) {
    if (error instanceof SearchDatabaseError) throw error;
    throw new SearchDatabaseError("unavailable", { cause: error });
  }
}

async function paid(sql: DatabaseTransaction, companyId: string) {
  const [row] = await sql<{ active: boolean }[]>`select exists (
    select 1 from private.subscriptions where company_id = ${companyId} and status = 'active'
  ) as active`;
  return row.active;
}
function plan(usage: Usage, active: boolean): CompanyPlan {
  return {
    plan: active ? "paid" : "free",
    searches_remaining: active
      ? null
      : usage.free_searches_used === 1 || usage.reserved_search_id !== null
        ? 0
        : 1,
  };
}
async function release(
  sql: DatabaseTransaction,
  usage: Usage,
  searchId: string,
) {
  await sql`update private.company_usage set reserved_search_id = null, reservation_expires_at = null
    where company_id = ${usage.company_id} and reserved_search_id = ${searchId}`;
  if (usage.reserved_search_id === searchId) {
    usage.reserved_search_id = null;
    usage.reservation_expires_at = null;
  }
}
async function markFailed(
  sql: DatabaseTransaction,
  usage: Usage,
  searchId: string,
  reason: string,
) {
  const changed =
    await sql`update public.searches set status = 'failed', completed_at = clock_timestamp()
    where id = ${searchId} and company_id = ${usage.company_id} and status = 'pending'`;
  if (changed.count) {
    await sql`update private.search_executions set failure_reason = ${reason.slice(0, 200)}
      where search_id = ${searchId} and company_id = ${usage.company_id}`;
    await release(sql, usage, searchId);
  }
}
async function reclaimExpired(
  sql: DatabaseTransaction,
  usage: Usage,
  now: Date,
) {
  if (
    usage.reserved_search_id &&
    usage.reservation_expires_at &&
    usage.reservation_expires_at <= now
  ) {
    const id = usage.reserved_search_id;
    await markFailed(sql, usage, id, "lease_expired");
    await release(sql, usage, id);
  }
}

export async function getPlan(recruiterId: string): Promise<CompanyPlan> {
  return transaction<CompanyPlan>(recruiterId, async (sql, usage, now) => {
    await reclaimExpired(sql, usage, now);
    return plan(usage, await paid(sql, usage.company_id));
  });
}

export async function beginSearch(
  recruiterId: string,
  brief: string,
  requestKey: string | null,
  requestHash: string,
): Promise<SearchExecution> {
  if (
    !brief.trim() ||
    brief.length > 4000 ||
    !requestHash ||
    requestHash.length > 128 ||
    (requestKey !== null && (!requestKey || requestKey.length > 128))
  ) {
    throw new SearchDatabaseError("invalid");
  }
  return transaction<SearchExecution>(recruiterId, async (sql, usage, now) => {
    let searchId: string | undefined;
    if (requestKey !== null) {
      const [previous] = await sql<
        Execution[]
      >`select execution.*, search.status from private.search_executions as execution
        join public.searches as search on search.id = execution.search_id and search.company_id = execution.company_id
        where execution.company_id = ${usage.company_id} and execution.request_key = ${requestKey}`;
      if (previous) {
        if (previous.request_hash !== requestHash) return { error: "conflict" };
        if (previous.status === "completed")
          return {
            searchId: previous.search_id,
            attemptId: previous.attempt_id,
            replayed: true,
            status: "completed",
          };
        if (previous.status === "pending" && previous.lease_expires_at > now)
          return { error: "pending" };
        searchId = previous.search_id;
      }
    }
    await reclaimExpired(sql, usage, now);
    const active = await paid(sql, usage.company_id);
    if (
      !active &&
      (usage.free_searches_used === 1 || usage.reserved_search_id !== null)
    )
      return { error: "quota" };
    const attemptId = crypto.randomUUID();
    // Outlive the 15-second interpreter deadline with room for DB completion.
    const expiry = new Date(now.getTime() + 30000);
    if (!searchId) {
      const [created] = await sql<
        { id: string }[]
      >`insert into public.searches(company_id, brief, created_by)
        values (${usage.company_id}, ${brief}, ${recruiterId}) returning id`;
      searchId = created.id;
      await sql`insert into private.search_executions(search_id, company_id, request_key, request_hash, attempt_id, lease_expires_at, admitted_plan)
        values (${searchId}, ${usage.company_id}, ${requestKey}, ${requestHash}, ${attemptId}, ${expiry}, ${active ? "paid" : "free"})`;
    } else {
      await sql`update public.searches set status = 'pending', completed_at = null, total = 0, filters = '{}'::jsonb
        where id = ${searchId} and company_id = ${usage.company_id}`;
      await sql`delete from public.search_results where search_id = ${searchId}`;
      await sql`update private.search_executions set attempt_id = ${attemptId}, lease_expires_at = ${expiry},
        admitted_plan = ${active ? "paid" : "free"}, failure_reason = null where search_id = ${searchId} and company_id = ${usage.company_id}`;
    }
    if (!active)
      await sql`update private.company_usage set reserved_search_id = ${searchId}, reservation_expires_at = ${expiry} where company_id = ${usage.company_id}`;
    return { searchId, attemptId, replayed: false, status: "pending" };
  });
}

export async function completeSearch(
  recruiterId: string,
  searchId: string,
  attemptId: string,
  suppliedFilters: SearchFilters,
): Promise<{ searchId: string; searchesRemaining: number | null }> {
  const filters = validateSearchFilters(suppliedFilters);
  if (!filters) throw new SearchDatabaseError("invalid");
  return transaction<{ searchId: string; searchesRemaining: number | null }>(
    recruiterId,
    async (sql, usage, now) => {
      const [execution] = await sql<
        Execution[]
      >`select execution.*, search.status from private.search_executions as execution
      join public.searches as search on search.id = execution.search_id and search.company_id = execution.company_id
      where execution.search_id = ${searchId} and execution.company_id = ${usage.company_id}`;
      if (!execution) return { error: "not_found" };
      if (execution.attempt_id !== attemptId) return { error: "stale" };
      if (execution.status === "completed") {
        await reclaimExpired(sql, usage, now);
        return {
          searchId,
          searchesRemaining: plan(usage, await paid(sql, usage.company_id))
            .searches_remaining,
        };
      }
      if (execution.status !== "pending" || execution.lease_expires_at <= now) {
        await markFailed(sql, usage, searchId, "lease_expired");
        return { error: "stale" };
      }
      await reclaimExpired(sql, usage, now);
      const active = await paid(sql, usage.company_id);
      if (
        !active &&
        (usage.free_searches_used === 1 ||
          (usage.reserved_search_id !== null &&
            usage.reserved_search_id !== searchId))
      ) {
        await markFailed(sql, usage, searchId, "entitlement_changed");
        return { error: "quota" };
      }
      const inserted =
        await sql`insert into public.search_results(search_id, candidate_id, position)
      select ${searchId}::uuid, matched.id, row_number() over (order by matched.preference_score desc, matched.years_experience desc, matched.id)::integer
      from (${matchingCandidates(sql, filters)}) as matched`;
      let total = inserted.count;
      const [all] = await sql<
        { count: number }[]
      >`select count(*)::integer as count from public.candidates`;
      if (total > 0 && total === all.count) {
        await sql`delete from public.search_results where search_id = ${searchId}`;
        total = 0;
        filters.issues.push({
          text: "Add a narrower supported criterion to search safely.",
          kind: "ambiguous",
          required: true,
        });
      }
      await sql`update public.searches set filters = ${sql.json(filters)}, total = ${total}, status = 'completed', completed_at = clock_timestamp()
      where id = ${searchId} and company_id = ${usage.company_id}`;
      await sql`update private.search_executions set failure_reason = null where search_id = ${searchId} and company_id = ${usage.company_id}`;
      await release(sql, usage, searchId);
      if (!active)
        await sql`update private.company_usage set free_searches_used = 1 where company_id = ${usage.company_id}`;
      return { searchId, searchesRemaining: active ? null : 0 };
    },
  );
}

export async function failSearch(
  recruiterId: string,
  searchId: string,
  attemptId: string,
  reason = "execution_failed",
): Promise<void> {
  await transaction<{ ok: true }>(recruiterId, async (sql, usage) => {
    const [execution] = await sql<
      Execution[]
    >`select * from private.search_executions where search_id = ${searchId} and company_id = ${usage.company_id}`;
    if (!execution) return { error: "not_found" };
    if (execution.attempt_id !== attemptId) return { error: "stale" };
    await markFailed(sql, usage, searchId, reason);
    return { ok: true };
  });
}
