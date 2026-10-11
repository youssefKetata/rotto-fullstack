import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("saved-search migration consolidates duplicates and retains distinct searches", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create table public.saved_briefs (
    id uuid primary key default gen_random_uuid(), company_id uuid not null,
    brief text not null, filters jsonb not null, created_at timestamptz not null
  );
  insert into public.saved_briefs values
    ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',' React ','{"a":1,"b":2}','2026-10-01'),
    ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','React','{"b":2,"a":1}','2026-10-02'),
    ('00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','React','{"a":1,"b":2}','2026-10-02'),
    ('00000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','React','{"a":3,"b":2}','2026-10-02');`);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261011190000_unique_saved_searches.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const { rows } = await db.query(
    "select id, brief from public.saved_briefs order by id",
  );
  assert.deepEqual(
    rows,
    [1, 3, 4].map((id) => ({
      id: `00000000-0000-0000-0000-00000000000${id}`,
      brief: "React",
    })),
  );
  await assert.rejects(
    db.exec(`insert into public.saved_briefs values
    (gen_random_uuid(),'10000000-0000-0000-0000-000000000001',' React ','{"b":2,"a":1}',now())`),
    { code: "23505" },
  );
  // Large valid briefs/filters must not exceed the B-tree index entry size.
  await db.query(
    "insert into public.saved_briefs values (gen_random_uuid(), $1, $2, $3, now())",
    [
      "10000000-0000-0000-0000-000000000001",
      "x".repeat(4000),
      JSON.stringify({ text: "y".repeat(10000) }),
    ],
  );
});
