import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { stagingSql } from "../../scripts/seed.mjs";

const root = new URL("../../", import.meta.url);
const acme = {
  user: "10000000-0000-0000-0000-000000000001",
  company: "20000000-0000-0000-0000-000000000001",
  shortlist: "30000000-0000-0000-0000-000000000001",
  saved: "40000000-0000-0000-0000-000000000001",
  search: "50000000-0000-0000-0000-000000000001",
};
const globex = Object.fromEntries(
  Object.entries(acme).map(([key, value]) => [key, value.slice(0, -1) + "2"]),
);
const publicTables = [
  "companies",
  "recruiters",
  "candidates",
  "candidate_experiences",
  "candidate_education",
  "shortlists",
  "shortlist_people",
  "saved_briefs",
  "searches",
  "search_results",
];
const privateTables = ["company_usage", "billing_events", "subscriptions"];

// Stand-ins for Supabase Auth; application migrations run unchanged.
const bootstrap = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public
    grant all on tables to anon, authenticated, service_role;
`;

async function asRole(db, role, user, run) {
  assert.ok(
    ["postgres", "anon", "authenticated", "service_role"].includes(role),
  );
  await db.exec(`begin; set local role ${role};`);
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [
      user ?? "",
    ]);
    await run();
  } finally {
    await db.exec("rollback;");
  }
}

async function expectError(db, sql, code) {
  await db.exec("savepoint expected_failure;");
  try {
    await assert.rejects(db.exec(sql), (error) => error.code === code);
  } finally {
    await db.exec(
      "rollback to savepoint expected_failure; release savepoint expected_failure;",
    );
  }
}

async function rows(db, sql, parameters = []) {
  return (await db.query(sql, parameters)).rows;
}

async function importCandidates(db, candidates) {
  await db.exec("drop table if exists pg_temp.seed_candidates;");
  await db.query(stagingSql, [JSON.stringify(candidates)]);
  await db.exec(
    await readFile(new URL("supabase/seed-candidates.sql", root), "utf8"),
  );
}

const seedCandidate = {
  id: "cand_test_a",
  full_name: "O'Neil",
  headline: "Updated profile",
  avatar_url: "/updated.svg",
  current_title: "Frontend Engineer",
  current_company: "Startup A",
  current_company_logo_url: "/company-a.svg",
  role: "Frontend Engineer",
  seniority: "senior",
  years_experience: 8,
  location: { city: "New York", state: "NY", country: "US" },
  open_to_work: true,
  skills: ["React", "TypeScript"],
  experiences: [
    {
      title: "Frontend Engineer",
      company: "Startup A",
      company_logo_url: "/company-a.svg",
      company_type: "startup",
      start_year: 2020,
      end_year: null,
      description: "React",
    },
    {
      title: "Junior Engineer",
      company: "Startup B",
      company_logo_url: "/company-b.svg",
      company_type: "startup",
      start_year: 2018,
      end_year: 2020,
      description: "TypeScript",
    },
  ],
  education: [
    {
      school: "School A",
      degree: "BS",
      field: "Computer Science",
      graduation_year: 2018,
    },
    {
      school: "School B",
      degree: "MS",
      field: "Computer Science",
      graduation_year: 2020,
    },
  ],
};

test("database schema and recruiter isolation", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(bootstrap);
  const directory = new URL("supabase/migrations/", root);
  const migrations = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.ok(migrations.length > 0);
  for (const migration of migrations) {
    await db.exec(await readFile(new URL(migration, directory), "utf8"));
  }
  await db.exec(
    await readFile(new URL("tests/database/fixtures.sql", root), "utf8"),
  );

  for (const [name, own, other] of [
    ["acme", acme, globex],
    ["globex", globex, acme],
  ]) {
    await t.test(
      `${name} sees shared candidates and only its own company records`,
      async () => {
        await asRole(db, "authenticated", own.user, async () => {
          assert.deepEqual(await rows(db, "select id from public.companies"), [
            { id: own.company },
          ]);
          assert.deepEqual(await rows(db, "select id from public.recruiters"), [
            { id: own.user },
          ]);
          for (const table of [
            "candidates",
            "candidate_experiences",
            "candidate_education",
          ]) {
            const [result] = await rows(
              db,
              `select count(*)::integer as count from public.${table}`,
            );
            assert.equal(result.count, 2);
          }
          for (const [table, id] of [
            ["shortlists", own.shortlist],
            ["saved_briefs", own.saved],
            ["searches", own.search],
          ]) {
            assert.deepEqual(await rows(db, `select id from public.${table}`), [
              { id },
            ]);
          }
          assert.deepEqual(
            await rows(db, "select shortlist_id from public.shortlist_people"),
            [{ shortlist_id: own.shortlist }],
          );
          assert.deepEqual(
            await rows(db, "select search_id from public.search_results"),
            [{ search_id: own.search }],
          );
          assert.deepEqual(
            await rows(db, "select * from public.shortlists where id = $1", [
              other.shortlist,
            ]),
            [],
          );
          assert.deepEqual(
            await rows(db, "select * from public.saved_briefs where id = $1", [
              other.saved,
            ]),
            [],
          );
          assert.deepEqual(
            await rows(
              db,
              "select * from public.search_results where search_id = $1",
              [other.search],
            ),
            [],
          );
        });
      },
    );

    await t.test(
      `${name} can create, rename, and delete its shortlist`,
      async () => {
        await asRole(db, "authenticated", own.user, async () => {
          const [created] = await rows(
            db,
            `
          insert into public.shortlists (name) values ('New list')
          returning id, company_id, created_by
        `,
          );
          assert.equal(created.company_id, own.company);
          assert.equal(created.created_by, own.user);
          assert.deepEqual(
            await rows(
              db,
              "update public.shortlists set name = 'Renamed' where id = $1 returning name",
              [created.id],
            ),
            [{ name: "Renamed" }],
          );
          await db.query(
            "insert into public.shortlist_people (shortlist_id, candidate_id) values ($1, $2)",
            [created.id, "cand_test_a"],
          );
          await db.query("delete from public.shortlists where id = $1", [
            created.id,
          ]);
          assert.deepEqual(
            await rows(
              db,
              "select * from public.shortlist_people where shortlist_id = $1",
              [created.id],
            ),
            [],
          );
          const [updated] = await rows(
            db,
            `
          update public.shortlists set name = 'Changed' where id = $1
          returning updated_at > '2020-01-01'::timestamptz as timestamp_updated
        `,
            [own.shortlist],
          );
          assert.equal(updated.timestamp_updated, true);
        });
      },
    );

    await t.test(
      `${name} cannot modify the other company's shortlist or saved brief`,
      async () => {
        await asRole(db, "authenticated", own.user, async () => {
          assert.deepEqual(
            await rows(
              db,
              "update public.shortlists set name = 'Intrusion' where id = $1 returning id",
              [other.shortlist],
            ),
            [],
          );
          assert.deepEqual(
            await rows(
              db,
              "delete from public.shortlists where id = $1 returning id",
              [other.shortlist],
            ),
            [],
          );
          assert.deepEqual(
            await rows(
              db,
              "delete from public.saved_briefs where id = $1 returning id",
              [other.saved],
            ),
            [],
          );
          assert.deepEqual(
            await rows(
              db,
              "delete from public.shortlist_people where shortlist_id = $1 returning candidate_id",
              [other.shortlist],
            ),
            [],
          );
          await expectError(
            db,
            `
          insert into public.shortlist_people (shortlist_id, candidate_id)
          values ('${other.shortlist}', 'cand_test_a')
        `,
            "42501",
          );
        });
      },
    );
  }

  await t.test("saved briefs receive trusted ownership defaults", async () => {
    await asRole(db, "authenticated", acme.user, async () => {
      const [saved] = await rows(
        db,
        `
        insert into public.saved_briefs (brief, filters) values ('React', '{"skills":["React"]}')
        returning id, company_id, created_by
      `,
      );
      assert.equal(saved.company_id, acme.company);
      assert.equal(saved.created_by, acme.user);
      await db.query("delete from public.saved_briefs where id = $1", [
        saved.id,
      ]);
      assert.deepEqual(
        await rows(db, "select * from public.saved_briefs where id = $1", [
          saved.id,
        ]),
        [],
      );
    });
  });

  await t.test(
    "clients cannot spoof ownership or write server-owned data",
    async () => {
      await asRole(db, "authenticated", acme.user, async () => {
        for (const sql of [
          `insert into public.shortlists (name, company_id) values ('Spoof', '${globex.company}')`,
          `insert into public.saved_briefs (brief, filters, created_by) values ('Spoof', '{}', '${globex.user}')`,
          `update public.shortlists set company_id = '${globex.company}' where id = '${acme.shortlist}'`,
          `update public.shortlists set created_by = '${globex.user}' where id = '${acme.shortlist}'`,
          `update public.shortlists set updated_at = now() where id = '${acme.shortlist}'`,
          `update public.recruiters set company_id = '${globex.company}' where id = '${acme.user}'`,
          "update public.companies set name = 'Spoof'",
          "update public.candidates set headline = 'Spoof'",
          "delete from public.candidate_experiences",
          "delete from public.candidate_education",
          `insert into public.searches (company_id, brief, created_by) values ('${acme.company}', 'Bypass', '${acme.user}')`,
          "update public.searches set total = 999",
          "delete from public.search_results",
          `update public.shortlist_people set shortlist_id = '${globex.shortlist}'`,
          "update public.saved_briefs set filters = '{}'",
        ]) {
          await expectError(db, sql, "42501");
        }
      });
    },
  );

  await t.test(
    "anonymous callers have no application data access",
    async () => {
      await asRole(db, "anon", null, async () => {
        for (const table of publicTables) {
          await expectError(db, `select * from public.${table}`, "42501");
        }
        await expectError(
          db,
          "insert into public.shortlists (name) values ('Anonymous')",
          "42501",
        );
        await expectError(db, "select private.current_company_id()", "42501");
      });
    },
  );

  await t.test(
    "an authenticated account without recruiter membership has no access",
    async () => {
      await asRole(
        db,
        "authenticated",
        "10000000-0000-0000-0000-000000000003",
        async () => {
          for (const table of publicTables) {
            assert.deepEqual(
              await rows(db, `select * from public.${table}`),
              [],
            );
          }
          await expectError(
            db,
            "insert into public.shortlists (name) values ('Unassigned')",
            "42501",
          );
        },
      );
    },
  );

  await t.test(
    "billing and usage tables are inaccessible to recruiters",
    async () => {
      await asRole(db, "authenticated", acme.user, async () => {
        for (const table of privateTables) {
          await expectError(db, `select * from private.${table}`, "42501");
          await expectError(db, `delete from private.${table}`, "42501");
        }
        await expectError(
          db,
          "update private.company_usage set free_searches_used = 0",
          "42501",
        );
      });
    },
  );

  await t.test(
    "unfinished search results remain hidden until completion",
    async () => {
      await asRole(db, "postgres", acme.user, async () => {
        const [search] = await rows(
          db,
          `insert into public.searches (company_id, brief, created_by)
        values ('${acme.company}', 'Pending', '${acme.user}') returning id`,
        );
        await db.query(
          "insert into public.search_results (search_id, candidate_id, position) values ($1, $2, 1)",
          [search.id, "cand_test_a"],
        );
        await db.exec("set local role authenticated;");
        assert.deepEqual(
          await rows(
            db,
            "select * from public.search_results where search_id = $1",
            [search.id],
          ),
          [],
        );
        await db.exec("set local role postgres;");
        await db.query(
          "update public.searches set status = 'completed', completed_at = now(), total = 1 where id = $1",
          [search.id],
        );
        await db.exec("set local role authenticated;");
        assert.deepEqual(
          await rows(
            db,
            "select candidate_id from public.search_results where search_id = $1",
            [search.id],
          ),
          [{ candidate_id: "cand_test_a" }],
        );
      });
    },
  );

  await t.test(
    "company seed is repeatable and preserves consumed usage and shortlists",
    async () => {
      await asRole(db, "postgres", null, async () => {
        await db.exec(
          `update private.company_usage set free_searches_used = 1 where company_id = '${acme.company}'`,
        );
        const seedSql = await readFile(
          new URL("supabase/seed.sql", root),
          "utf8",
        );
        await db.exec(seedSql);
        await db.exec(seedSql);
        assert.deepEqual(
          await rows(
            db,
            "select count(*)::integer as count from public.companies",
          ),
          [{ count: 2 }],
        );
        assert.deepEqual(
          await rows(
            db,
            "select free_searches_used from private.company_usage where company_id = $1",
            [acme.company],
          ),
          [{ free_searches_used: 1 }],
        );
        assert.deepEqual(
          await rows(db, "select name from public.shortlists where id = $1", [
            acme.shortlist,
          ]),
          [{ name: "Acme list" }],
        );
      });
    },
  );

  await t.test(
    "candidate seed refreshes histories without duplicating or replacing their IDs",
    async () => {
      await asRole(db, "postgres", null, async () => {
        await importCandidates(db, [seedCandidate]);
        const originalHistory = await rows(
          db,
          "select id, position from public.candidate_experiences where candidate_id = 'cand_test_a' order by position",
        );
        const originalEducation = await rows(
          db,
          "select id, position from public.candidate_education where candidate_id = 'cand_test_a' order by position",
        );
        await importCandidates(db, [seedCandidate]);
        assert.deepEqual(
          await rows(
            db,
            "select id, position from public.candidate_experiences where candidate_id = 'cand_test_a' order by position",
          ),
          originalHistory,
        );
        assert.deepEqual(
          await rows(
            db,
            "select id, position from public.candidate_education where candidate_id = 'cand_test_a' order by position",
          ),
          originalEducation,
        );
        const changed = structuredClone(seedCandidate);
        changed.experiences = changed.experiences.slice(0, 1);
        changed.education = changed.education.slice(0, 1);
        changed.full_name = "Changed profile";
        await importCandidates(db, [changed]);
        assert.deepEqual(
          await rows(
            db,
            "select id, position from public.candidate_experiences where candidate_id = 'cand_test_a'",
          ),
          [originalHistory[0]],
        );
        assert.deepEqual(
          await rows(
            db,
            "select id, position from public.candidate_education where candidate_id = 'cand_test_a'",
          ),
          [originalEducation[0]],
        );
        assert.deepEqual(
          await rows(
            db,
            "select full_name from public.candidates where id = 'cand_test_a'",
          ),
          [{ full_name: "Changed profile" }],
        );
        assert.deepEqual(
          await rows(
            db,
            "select candidate_id from public.shortlist_people where shortlist_id = $1",
            [acme.shortlist],
          ),
          [{ candidate_id: "cand_test_a" }],
        );
        assert.deepEqual(
          await rows(
            db,
            "select count(*)::integer as count from public.candidates",
          ),
          [{ count: 2 }],
        );
      });
    },
  );

  await t.test(
    "invalid candidate history rolls back the profile import",
    async () => {
      await asRole(db, "postgres", null, async () => {
        const invalid = structuredClone(seedCandidate);
        invalid.experiences[0].end_year = 1900;
        await db.exec("savepoint candidate_import;");
        await assert.rejects(
          importCandidates(db, [invalid]),
          (error) => error.code === "23514",
        );
        await db.exec(
          "rollback to savepoint candidate_import; release savepoint candidate_import;",
        );
        assert.deepEqual(
          await rows(
            db,
            "select full_name from public.candidates where id = 'cand_test_a'",
          ),
          [{ full_name: "Test A" }],
        );
      });
    },
  );
});
