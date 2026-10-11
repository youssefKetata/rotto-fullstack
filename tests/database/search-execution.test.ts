import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getDatabase } from "../../src/lib/database";
import {
  completeSearch,
  failSearch,
  getPlan,
} from "../../src/lib/search/database";
import { matchingCandidates } from "../../src/lib/search/query";
import { GEMINI_TIMEOUT_MS } from "../../src/lib/search/gemini";
import type {
  SearchCriteria,
  SearchFilters,
} from "../../src/lib/search/schema";
import { noMatches, withSearchFixture } from "./search-fixture";

function filters(criteria: SearchCriteria): SearchFilters {
  return { version: 1, anyOf: [criteria], preferred: [], issues: [] };
}
const reference = [
  filters({
    seniorities: ["senior"],
    skillsAll: ["React"],
    locations: [{ city: "New York" }],
    experience: [{ scope: "any", companyTypes: ["startup"] }],
  }),
  filters({
    roles: ["Product Designer"],
    locations: [{ city: "San Francisco" }],
    openToWork: true,
  }),
  filters({ roles: ["Data Scientist"], education: [{ degrees: ["PhD"] }] }),
  filters({
    roles: ["Backend Engineer"],
    skillsAll: ["Go", "Kubernetes"],
    locations: [{ city: "Austin" }],
  }),
  filters({
    roles: ["Full Stack Engineer"],
    seniorities: ["staff"],
    locations: [{ city: "Seattle" }],
  }),
  filters({
    roles: ["Machine Learning Engineer"],
    education: [{ schools: ["Stanford University"] }],
  }),
  filters({
    roles: ["Account Executive"],
    locations: [{ city: "Chicago" }],
    skillsAll: ["Enterprise Sales"],
  }),
  filters({
    roles: ["Frontend Engineer"],
    seniorities: ["junior"],
    locations: [{ city: "Boston" }],
    openToWork: true,
  }),
  filters({ roles: ["Mobile Engineer"], skillsAll: ["Swift"] }),
  {
    ...filters({ roles: ["Product Manager"] }),
    issues: [
      { text: "Japanese", kind: "unsupported" as const, required: true },
    ],
  },
];

test("TypeScript search services preserve quota, snapshots and matching", async (t) => {
  t.after(() => getDatabase().end({ timeout: 5 }));
  await t.test(
    "reservation outlives interpretation and database completion",
    async () => {
      await withSearchFixture(async (f) => {
        const execution = await f.begin();
        const [lease] = await f.sql<
          { remaining_ms: number; reservation_matches: boolean }[]
        >`select extract(epoch from (execution.lease_expires_at - clock_timestamp())) * 1000 as remaining_ms,
        usage.reservation_expires_at = execution.lease_expires_at as reservation_matches
        from private.search_executions as execution
        join private.company_usage as usage on usage.company_id = execution.company_id
        where execution.search_id = ${execution.searchId}`;
        assert.ok(lease.remaining_ms > GEMINI_TIMEOUT_MS + 5000);
        assert.equal(lease.reservation_matches, true);
        await f.complete(execution);
        assert.deepEqual(await f.plan(), {
          plan: "free",
          searches_remaining: 0,
        });
      });
    },
  );
  await t.test(
    "free reservation, completed replay and conflicting keys",
    async () => {
      await withSearchFixture(async (f) => {
        assert.deepEqual(await f.plan(), {
          plan: "free",
          searches_remaining: 1,
        });
        const first = await f.begin("click-key");
        assert.deepEqual(await f.plan(), {
          plan: "free",
          searches_remaining: 0,
        });
        await assert.rejects(f.begin(), { code: "quota" });
        await assert.rejects(f.begin("click-key"), { code: "pending" });
        await assert.rejects(f.begin("click-key", "changed"), {
          code: "conflict",
        });
        await f.complete(first);
        const replay = await f.begin("click-key");
        assert.equal(replay.searchId, first.searchId);
        assert.equal(replay.replayed, true);
        await assert.rejects(f.begin("different-click"), { code: "quota" });
        await f.complete(first, filters({ skillsAll: ["Go"] }));
        assert.deepEqual(await f.ids(first.searchId), []);
        await failSearch(f.userId, first.searchId, first.attemptId);
        const [row] =
          await f.sql`select status from public.searches where id = ${first.searchId}`;
        assert.equal(row.status, "completed");
      });
    },
  );
  await t.test(
    "failure releases allowance; retries reject stale responses",
    async () => {
      await withSearchFixture(async (f) => {
        const first = await f.begin("retry-key");
        await failSearch(f.userId, first.searchId, first.attemptId);
        assert.deepEqual(await f.plan(), {
          plan: "free",
          searches_remaining: 1,
        });
        const retry = await f.begin("retry-key");
        assert.equal(retry.searchId, first.searchId);
        assert.notEqual(retry.attemptId, first.attemptId);
        await assert.rejects(f.complete(first), { code: "stale" });
        await assert.rejects(
          failSearch(f.userId, first.searchId, first.attemptId),
          { code: "stale" },
        );
        await f.expire(retry);
        assert.deepEqual(await f.plan(), {
          plan: "free",
          searches_remaining: 1,
        });
        const replacement = await f.begin("replacement-key");
        await assert.rejects(f.complete(retry), { code: "stale" });
        await f.complete(replacement);
      });
    },
  );
  await t.test(
    "a result insertion error rolls back completion and usage",
    async () => {
      await withSearchFixture(async (f) => {
        const execution = await f.begin();
        // Force a real constraint failure without altering the shared schema.
        await f.sql`insert into public.search_results(search_id,candidate_id,position) values (${execution.searchId},'cand_0001',1)`;
        await assert.rejects(f.complete(execution, filters({ minYears: 1 })), {
          code: "unavailable",
        });
        const [row] =
          await f.sql`select search.status,usage.free_searches_used from public.searches as search
        join private.company_usage as usage on usage.company_id = search.company_id where search.id = ${execution.searchId}`;
        assert.deepEqual(
          { ...row },
          { status: "pending", free_searches_used: 0 },
        );
        await failSearch(f.userId, execution.searchId, execution.attemptId);
        assert.deepEqual(await f.plan(), {
          plan: "free",
          searches_remaining: 1,
        });
      });
    },
  );
  await t.test(
    "unsupported and universal filters yield zero metered matches; invalid filters fail",
    async () => {
      await withSearchFixture(async (f) => {
        await f.paid();
        for (const value of [
          noMatches,
          reference[9],
          filters({ minYears: 0 }),
        ]) {
          const execution = await f.begin();
          await f.complete(execution, value);
          assert.deepEqual(await f.ids(execution.searchId), []);
          const [stored] =
            await f.sql`select status,filters from public.searches where id = ${execution.searchId}`;
          assert.equal(stored.status, "completed");
          if (value.anyOf[0]?.minYears === 0)
            assert.equal(stored.filters.issues[0].required, true);
        }
        const execution = await f.begin();
        await assert.rejects(
          f.complete(execution, {
            ...noMatches,
            anyOf: "SQL",
          } as unknown as SearchFilters),
          { code: "invalid" },
        );
      });
    },
  );
  await t.test(
    "upgrade preserves free usage and cancellation rechecks allowance",
    async () => {
      await withSearchFixture(async (f) => {
        const upgrading = await f.begin();
        await f.paid();
        await f.complete(upgrading);
        await f.cancel();
        assert.deepEqual(await f.plan(), {
          plan: "free",
          searches_remaining: 1,
        });
        await f.paid(300);
        const one = await f.begin();
        const two = await f.begin();
        await f.cancel(400);
        await f.complete(one);
        await assert.rejects(f.complete(two), { code: "quota" });
        await f.paid(500);
        const again = await f.begin();
        await f.complete(again);
        await f.cancel(600);
        assert.deepEqual(await f.plan(), {
          plan: "free",
          searches_remaining: 0,
        });
      });
    },
  );
  await t.test(
    "a canceled paid attempt cannot steal another free reservation",
    async () => {
      await withSearchFixture(async (f) => {
        await f.paid();
        const paid = await f.begin();
        await f.cancel();
        const reserved = await f.begin();
        await assert.rejects(f.complete(paid), { code: "quota" });
        assert.deepEqual(await f.plan(), {
          plan: "free",
          searches_remaining: 0,
        });
        await f.complete(reserved);
      });
    },
  );
  await t.test(
    "direct server operations reject foreign ownership and missing membership",
    async () => {
      await withSearchFixture(async (a) =>
        withSearchFixture(async (b) => {
          const execution = await a.begin();
          await assert.rejects(
            completeSearch(
              b.userId,
              execution.searchId,
              execution.attemptId,
              noMatches,
            ),
            { code: "not_found" },
          );
          await assert.rejects(
            failSearch(b.userId, execution.searchId, execution.attemptId),
            { code: "not_found" },
          );
          await assert.rejects(getPlan(randomUUID()), { code: "not_found" });
          const functions =
            await a.sql`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','private') and (proname like 'rotto_%' or proname like 'search_%')`;
          assert.equal(
            functions.length,
            0,
            "Business functions must be removed from Postgres.",
          );
        }),
      );
    },
  );
  await t.test(
    "history conditions stay on one record; exclusions, OR and preferences survive",
    async () => {
      const sql = getDatabase();
      // An isolated transaction creates candidates and rolls back every fixture row.
      const rollback = new Error("rollback fixture");
      await assert.rejects(
        sql.begin(async (tx) => {
          const a = `test_${randomUUID()}`;
          const b = `test_${randomUUID()}`;
          for (const [id, role, skills, city] of [
            [a, "Frontend Engineer", ["React", "TypeScript"], "New York"],
            [b, "Backend Engineer", ["Go"], "Austin"],
          ] as const) {
            await tx`insert into public.candidates(id,full_name,headline,avatar_url,current_title,current_company,current_company_logo_url,role,seniority,years_experience,city,state,country,open_to_work,skills)
          values (${id},'Fixture','Fixture','/avatar.svg',${role},'Fixture','/logo.svg',${role},'senior',4,${city},'NY','US',false,${tx.array([...skills])})`;
          }
          await tx`insert into public.candidate_experiences(candidate_id,position,title,company_name,company_logo_url,company_type,start_year,end_year,description) values
        (${a},0,'Frontend Engineer','Company A','/logo.svg','startup',2020,null,'current'),
        (${a},1,'Backend Engineer','Company B','/logo.svg','enterprise',2018,2019,'past'),
        (${b},0,'Backend Engineer','Company B','/logo.svg','enterprise',2020,null,'current')`;
          await tx`insert into public.candidate_education(candidate_id,position,school,degree,field,graduation_year) values
        (${a},0,'MIT','BS','Computer Science',2017),(${a},1,'Stanford University','PhD','Statistics',2020)`;
          const cases: [SearchCriteria, string[]][] = [
            [
              {
                experience: [
                  {
                    scope: "any",
                    companyTypes: ["startup"],
                    titles: ["Backend Engineer"],
                  },
                ],
              },
              [],
            ],
            [
              { experience: [{ scope: "past", companyTypes: ["enterprise"] }] },
              [a],
            ],
            [
              {
                experience: [
                  { scope: "current", companyTypes: ["enterprise"] },
                ],
              },
              [b],
            ],
            [{ education: [{ degrees: ["PhD"], schools: ["MIT"] }] }, []],
            [
              {
                education: [
                  {
                    degrees: ["PhD"],
                    schools: ["Stanford University"],
                    fields: ["Statistics"],
                    minGraduationYear: 2020,
                    maxGraduationYear: 2020,
                  },
                ],
              },
              [a],
            ],
            [{ skillsAny: ["React", "Go"], skillsNone: ["TypeScript"] }, [b]],
            [
              {
                excludeRoles: ["Frontend Engineer"],
                excludeLocations: [{ city: "New York" }],
              },
              [b],
            ],
            [{ minYears: 4, maxYears: 4, openToWork: false }, [a, b]],
            [
              {
                experience: [
                  { scope: "any", companyTypes: ["startup"], exclude: true },
                ],
              },
              [b],
            ],
            [{ roles: ["x'); drop table public.candidates; --"] }, []],
          ];
          for (const [criterion, expected] of cases) {
            const rows = await matchingCandidates(tx, filters(criterion));
            assert.deepEqual(
              rows
                .map((row) => row.id)
                .filter((id) => id === a || id === b)
                .sort(),
              expected.sort(),
              JSON.stringify(criterion),
            );
          }
          const rows = await matchingCandidates(tx, {
            ...noMatches,
            anyOf: [
              {
                roles: ["Frontend Engineer"],
                locations: [{ city: "New York" }],
              },
              { roles: ["Backend Engineer"], locations: [{ city: "Austin" }] },
            ],
            preferred: [{ skillsAll: ["Go"] }],
          });
          const own = rows
            .filter((row) => row.id === a || row.id === b)
            .sort(
              (left, right) => right.preference_score - left.preference_score,
            );
          assert.deepEqual(
            own.map((row) => row.id),
            [b, a],
          );
          throw rollback;
        }),
        (error) => error === rollback,
      );
    },
  );
  await t.test(
    "all ten reference sets and a large ordered snapshot match exactly",
    async () => {
      const queries = JSON.parse(
        readFileSync(
          new URL("../../data/queries.json", import.meta.url),
          "utf8",
        ),
      ) as { brief: string; expected_ids: string[] }[];
      const candidates = JSON.parse(
        readFileSync(
          new URL("../../data/candidates.json", import.meta.url),
          "utf8",
        ),
      ) as { id: string; years_experience: number }[];
      await withSearchFixture(async (f) => {
        await f.paid();
        for (const [index, value] of reference.entries()) {
          const execution = await f.begin();
          await f.complete(execution, value);
          assert.deepEqual(
            new Set(await f.ids(execution.searchId)),
            new Set(queries[index].expected_ids),
            queries[index].brief,
          );
        }
        const execution = await f.begin();
        await f.complete(execution, filters({ minYears: 2 }));
        const expected = candidates
          .filter((person) => person.years_experience >= 2)
          .sort(
            (a, b) =>
              b.years_experience - a.years_experience ||
              a.id.localeCompare(b.id),
          )
          .map((person) => person.id);
        assert.ok(expected.length > 1000);
        assert.deepEqual(await f.ids(execution.searchId), expected);
      });
    },
  );
});
