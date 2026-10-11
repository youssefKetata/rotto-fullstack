import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../../src/lib/database";
import { applyBillingEvent } from "../../src/lib/billing";
import {
  beginSearch,
  completeSearch,
  getPlan,
  type SearchExecution,
} from "../../src/lib/search/database";
import type { SearchFilters } from "../../src/lib/search/schema";

export const noMatches: SearchFilters = {
  version: 1,
  anyOf: [],
  preferred: [],
  issues: [],
};

// Integration tests own disposable identities; seeded company data is never reset.
export async function withSearchFixture(
  run: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>,
) {
  const fixture = await createFixture();
  try {
    await run(fixture);
  } finally {
    await fixture.cleanup();
  }
}

async function createFixture() {
  assert.ok(
    process.env.DATABASE_URL,
    "Run make setup before integration tests.",
  );
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(process.env.DATABASE_URL).hostname,
    ),
    "Use local Postgres only.",
  );
  const sql = getDatabase();
  const userId = randomUUID();
  const companyId = randomUUID();
  const slug = `test_${companyId.replaceAll("-", "")}`;
  const subscriptionId = `sub_${companyId}`;
  const events: string[] = [];
  await sql.begin(async (tx) => {
    await tx`insert into auth.users(id,email) values (${userId},${`${userId}@rotto-test.invalid`})`;
    await tx`insert into public.companies(id,slug,name) values (${companyId},${slug},'Server transaction fixture')`;
    await tx`insert into public.recruiters(id,company_id) values (${userId},${companyId})`;
    await tx`insert into private.company_usage(company_id) values (${companyId})`;
  });
  async function subscription(status: "active" | "canceled", created: number) {
    const id = `evt_${randomUUID()}`;
    events.push(id);
    const event = {
      id,
      created,
      type:
        status === "active"
          ? "customer.subscription.updated"
          : "customer.subscription.deleted",
      data: {
        object: { id: subscriptionId, status, metadata: { company: slug } },
      },
    };
    await applyBillingEvent(event);
  }
  return {
    sql,
    userId,
    companyId,
    slug,
    begin: (key: string | null = null, hash = "same-operation") =>
      beginSearch(userId, "Test search", key, hash),
    complete: (execution: SearchExecution, filters = noMatches) =>
      completeSearch(userId, execution.searchId, execution.attemptId, filters),
    plan: () => getPlan(userId),
    paid: (created = 100) => subscription("active", created),
    cancel: (created = 200) => subscription("canceled", created),
    async expire(execution: SearchExecution) {
      await sql.begin(async (tx) => {
        await tx`select company_id from private.company_usage where company_id = ${companyId} for update`;
        await tx`update private.search_executions set lease_expires_at = clock_timestamp() - interval '1 second' where search_id = ${execution.searchId}`;
        await tx`update private.company_usage set reservation_expires_at = clock_timestamp() - interval '1 second' where reserved_search_id = ${execution.searchId}`;
      });
    },
    async ids(searchId: string) {
      return (
        await sql<
          { candidate_id: string }[]
        >`select candidate_id from public.search_results where search_id = ${searchId} order by position`
      ).map((row) => row.candidate_id);
    },
    async cleanup() {
      await sql.begin(async (tx) => {
        await tx`delete from private.subscriptions where company_id = ${companyId}`;
        if (events.length)
          await tx`delete from private.billing_events where event_id in ${tx(events)}`;
        await tx`delete from private.company_usage where company_id = ${companyId}`;
        await tx`delete from public.searches where company_id = ${companyId}`;
        await tx`delete from public.recruiters where id = ${userId}`;
        await tx`delete from public.companies where id = ${companyId}`;
        await tx`delete from auth.users where id = ${userId}`;
      });
    },
  };
}
