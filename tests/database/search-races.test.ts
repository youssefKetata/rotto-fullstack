import assert from "node:assert/strict";
import test from "node:test";
import { getDatabase } from "../../src/lib/database";
import { SearchDatabaseError } from "../../src/lib/search/database";
import { withSearchFixture } from "./search-fixture";

test("server transactions serialize real Postgres races", async (t) => {
  t.after(() => getDatabase().end({ timeout: 5 }));
  await t.test(
    "thirty simultaneous searches reserve one free allowance",
    async () => {
      await withSearchFixture(async (f) => {
        const attempts = await Promise.allSettled(
          Array.from({ length: 30 }, (_, index) =>
            f.begin(`race-${index}`, `hash-${index}`),
          ),
        );
        const admitted = attempts.filter(
          (result) => result.status === "fulfilled",
        );
        assert.equal(admitted.length, 1);
        for (const result of attempts)
          if (result.status === "rejected")
            assert.equal((result.reason as SearchDatabaseError).code, "quota");
        await f.complete(admitted[0].value);
        assert.deepEqual(await f.plan(), {
          plan: "free",
          searches_remaining: 0,
        });
        const [counts] =
          await f.sql`select count(*)::integer as searches from public.searches where company_id = ${f.companyId}`;
        assert.equal(counts.searches, 1);
      });
    },
  );
  await t.test(
    "duplicate admission, completion and replay remain idempotent",
    async () => {
      await withSearchFixture(async (f) => {
        const attempts = await Promise.allSettled(
          Array.from({ length: 20 }, () => f.begin("same-key")),
        );
        const admitted = attempts.filter(
          (result) => result.status === "fulfilled",
        );
        assert.equal(admitted.length, 1);
        for (const result of attempts)
          if (result.status === "rejected")
            assert.equal(
              (result.reason as SearchDatabaseError).code,
              "pending",
            );
        const execution = admitted[0].value;
        const completed = await Promise.all(
          Array.from({ length: 10 }, () => f.complete(execution)),
        );
        assert.ok(
          completed.every(
            (result) =>
              result.searchId === execution.searchId &&
              result.searchesRemaining === 0,
          ),
        );
        const replayed = await Promise.all(
          Array.from({ length: 20 }, () => f.begin("same-key")),
        );
        assert.ok(
          replayed.every(
            (result) =>
              result.replayed && result.searchId === execution.searchId,
          ),
        );
        await assert.rejects(f.begin("new-key"), { code: "quota" });
      });
    },
  );
  await t.test(
    "expired responses cannot finish after another search reserves",
    async () => {
      await withSearchFixture(async (f) => {
        const old = await f.begin("old");
        await f.expire(old);
        const [replacement, stale] = await Promise.allSettled([
          f.begin("replacement"),
          f.complete(old),
        ]);
        assert.equal(replacement.status, "fulfilled");
        assert.equal(stale.status, "rejected");
        if (stale.status === "rejected")
          assert.equal(stale.reason.code, "stale");
        if (replacement.status === "fulfilled")
          await f.complete(replacement.value);
        const [counts] =
          await f.sql`select count(*)::integer as completed from public.searches where company_id = ${f.companyId} and status = 'completed'`;
        assert.equal(counts.completed, 1);
      });
    },
  );
  await t.test(
    "paid completions racing after cancellation use the free allowance once",
    async () => {
      await withSearchFixture(async (f) => {
        await f.paid();
        const first = await f.begin("paid-one");
        const second = await f.begin("paid-two");
        await f.cancel();
        const results = await Promise.allSettled([
          f.complete(first),
          f.complete(second),
        ]);
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
        const rejected = results.find((result) => result.status === "rejected");
        assert.equal(rejected?.reason.code, "quota");
        assert.deepEqual(await f.plan(), {
          plan: "free",
          searches_remaining: 0,
        });
      });
    },
  );
});
