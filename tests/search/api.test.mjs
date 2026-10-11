import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

// Local-only integration fixtures. Never spend/reset the seeded companies' allowance.
const base = process.env.ROTTO_TEST_BASE_URL ?? "http://localhost:3000";
const filters = {
  version: 1,
  anyOf: [{ minYears: 1 }],
  preferred: [],
  issues: [],
};
const empty = { version: 1, anyOf: [], preferred: [], issues: [] };

test("Bearer APIs, company isolation, quota, paging and signed billing", async (t) => {
  for (const url of [
    base,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.DATABASE_URL,
  ]) {
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
      "Use local services only.",
    );
  }
  const sql = postgres(process.env.DATABASE_URL, {
    max: 5,
    onnotice: () => {},
  });
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const fixtures = [];
  const eventIds = [];
  const initial =
    await sql`select company_id,free_searches_used from private.company_usage where company_id in (select id from public.companies where slug in ('acme','globex')) order by company_id`;
  t.after(async () => {
    try {
      for (const fixture of fixtures) {
        await sql.begin(async (tx) => {
          await tx`delete from private.subscriptions where company_id=${fixture.company}`;
          await tx`delete from private.company_usage where company_id=${fixture.company}`;
          await tx`delete from public.searches where company_id=${fixture.company}`;
          await tx`delete from public.saved_briefs where company_id=${fixture.company}`;
          await tx`delete from public.shortlists where company_id=${fixture.company}`;
          await tx`delete from public.recruiters where id=${fixture.user}`;
          await tx`delete from public.companies where id=${fixture.company}`;
        });
        await admin.auth.admin.deleteUser(fixture.user);
      }
      if (eventIds.length)
        await sql`delete from private.billing_events where event_id in ${sql(eventIds)}`;
      const after =
        await sql`select company_id,free_searches_used from private.company_usage where company_id in (select id from public.companies where slug in ('acme','globex')) order by company_id`;
      assert.deepEqual(after, initial, "Seeded allowances must be preserved.");
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
  async function fixture() {
    const company = randomUUID();
    const slug = `api_${company.replaceAll("-", "")}`;
    const email = `${slug}@rotto-test.invalid`;
    const password = `Test-${randomUUID()}`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.ifError(created.error);
    const user = created.data.user.id;
    const entry = { company, slug, user, client: null, token: null };
    fixtures.push(entry);
    await sql.begin(async (tx) => {
      await tx`insert into public.companies(id,slug,name) values(${company},${slug},'API test fixture')`;
      await tx`insert into public.recruiters(id,company_id) values(${user},${company})`;
      await tx`insert into private.company_usage(company_id) values(${company})`;
    });
    entry.client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const login = await entry.client.auth.signInWithPassword({
      email,
      password,
    });
    assert.ifError(login.error);
    entry.token = login.data.session.access_token;
    return entry;
  }
  const a = await fixture();
  const b = await fixture();
  async function request(
    path,
    { as = a, method = "GET", body, status = 200, headers = {} } = {},
  ) {
    const started = performance.now();
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(as ? { Authorization: `Bearer ${as.token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined
        ? { body: typeof body === "string" ? body : JSON.stringify(body) }
        : {}),
    });
    const data = await response.json();
    assert.ok(
      (Array.isArray(status) ? status : [status]).includes(response.status),
      `${method} ${path}: ${JSON.stringify(data)}`,
    );
    assert.match(response.headers.get("cache-control"), /no-store/);
    return { data, status: response.status, ms: performance.now() - started };
  }
  async function billing(
    created,
    status,
    type = "customer.subscription.updated",
    id = `evt_api_${randomUUID()}`,
  ) {
    if (!eventIds.includes(id)) eventIds.push(id);
    const body = JSON.stringify({
      id,
      type,
      created,
      data: {
        object: { id: `sub_${a.slug}`, status, metadata: { company: a.slug } },
      },
    });
    const timestamp = "1700000000";
    const signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    await request("/api/billing/events", {
      as: null,
      method: "POST",
      body,
      headers: { "Stripe-Signature": `t=${timestamp},v1=${signature}` },
    });
    return id;
  }

  await t.test(
    "authentication and strict input cannot start an execution",
    async () => {
      for (const path of [
        "/api/plan",
        "/api/search",
        "/api/shortlists",
        "/api/saved-briefs",
        "/api/people/cand_0001",
      ]) {
        await request(path, { as: null, status: 401 });
        await request(path, {
          as: null,
          headers: { Authorization: "Bearer invalid" },
          status: 401,
        });
      }
      for (const body of [
        "{",
        [],
        { brief: "" },
        { brief: "x".repeat(4001) },
        { brief: "React", company_id: b.company },
      ]) {
        await request("/api/search", { method: "POST", body, status: 400 });
      }
      await request("/api/search", {
        method: "POST",
        body: { brief: "React" },
        headers: { Origin: "https://attacker.invalid" },
        status: 403,
      });
      assert.equal((await request("/api/plan")).data.searches_remaining, 1);
      const [count] =
        await sql`select count(*)::int as n from public.searches where company_id=${a.company}`;
      assert.equal(count.n, 0);
    },
  );

  let list;
  let saved;
  let search;
  await t.test(
    "named shortlists and saved briefs persist under RLS",
    async () => {
      list = (
        await request("/api/shortlists", {
          method: "POST",
          body: { name: "First shortlist" },
          status: 201,
        })
      ).data.id;
      for (let i = 0; i < 2; i++)
        await request(`/api/shortlists/${list}/people/cand_0001`, {
          method: "POST",
        });
      const detail = (await request(`/api/shortlists/${list}`)).data;
      assert.equal(detail.people.length, 1);
      assert.ok(detail.people[0].experiences.length);
      assert.ok(detail.people[0].education.length);
      await request(`/api/shortlists/${list}`, {
        method: "PATCH",
        body: { name: "Renamed shortlist" },
      });
      assert.equal(
        (await request("/api/shortlists")).data[0].name,
        "Renamed shortlist",
      );
      saved = (
        await request("/api/saved-briefs", {
          method: "POST",
          body: { brief: "At least one year of experience", filters },
          status: 201,
        })
      ).data.id;
      assert.deepEqual(
        (await request("/api/saved-briefs")).data[0].filters,
        filters,
      );
      assert.equal((await request("/api/plan")).data.searches_remaining, 1);
    },
  );

  await t.test(
    "foreign company identifiers and direct Supabase access stay isolated",
    async () => {
      for (const [method, path, body] of [
        ["GET", `/api/shortlists/${list}`],
        ["PATCH", `/api/shortlists/${list}`, { name: "Stolen" }],
        ["DELETE", `/api/shortlists/${list}`],
        ["POST", `/api/shortlists/${list}/people/cand_0002`],
        ["DELETE", `/api/shortlists/${list}/people/cand_0001`],
        ["POST", `/api/saved-briefs/${saved}/rerun`, {}],
      ])
        await request(path, { as: b, method, body, status: 404 });
      assert.deepEqual((await request("/api/shortlists", { as: b })).data, []);
      assert.deepEqual(
        (await request("/api/saved-briefs", { as: b })).data,
        [],
      );
      for (const table of ["shortlists", "saved_briefs"]) {
        const read = await b.client
          .from(table)
          .select("*")
          .eq("company_id", a.company);
        assert.ifError(read.error);
        assert.deepEqual(read.data, []);
      }
      assert.ok(
        (
          await b.client
            .from("shortlists")
            .insert({ name: "Forged", company_id: a.company })
        ).error,
      );
      assert.ok(
        (
          await b.client
            .from("saved_briefs")
            .insert({ brief: "Forged", filters, company_id: a.company })
        ).error,
      );
      assert.ok(
        (
          await b.client
            .from("shortlist_people")
            .insert({ shortlist_id: list, candidate_id: "cand_0002" })
        ).error,
      );
      assert.ok(
        (await b.client.rpc("rotto_plan", { p_recruiter_id: a.user })).error,
      );
      assert.ok(
        (
          await b.client.rpc("rotto_apply_billing_event", {
            p_event: { id: "forged" },
          })
        ).error,
      );
    },
  );

  await t.test(
    "repeated and concurrent saves return one company-owned search",
    async () => {
      const body = { brief: "Repeated saved search", filters };
      const attempts = await Promise.all(
        Array.from({ length: 20 }, () =>
          request("/api/saved-briefs", {
            method: "POST",
            body,
            status: [200, 201],
          }),
        ),
      );
      const id = attempts[0].data.id;
      assert.equal(
        attempts.filter((attempt) => attempt.status === 201).length,
        1,
      );
      assert.ok(attempts.every((attempt) => attempt.data.id === id));
      const replay = await request("/api/saved-briefs", {
        method: "POST",
        body: { ...body, brief: ` ${body.brief} ` },
      });
      assert.equal(replay.data.id, id);
      const own = (await request("/api/saved-briefs")).data.filter(
        (entry) => entry.brief === body.brief,
      );
      assert.equal(own.length, 1);
      const changed = await request("/api/saved-briefs", {
        method: "POST",
        body: { ...body, filters: { ...filters, anyOf: [{ minYears: 2 }] } },
        status: 201,
      });
      assert.notEqual(changed.data.id, id);
      const other = await request("/api/saved-briefs", {
        as: b,
        method: "POST",
        body,
        status: 201,
      });
      assert.notEqual(other.data.id, id);
      assert.equal((await request("/api/plan")).data.searches_remaining, 1);
    },
  );

  await t.test(
    "one free execution, idempotent replay, and all results exactly once",
    async () => {
      const first = await request(`/api/saved-briefs/${saved}/rerun`, {
        method: "POST",
        body: {},
        headers: { "Idempotency-Key": "free-operation-01" },
      });
      search = first.data;
      assert.ok(search.total > 1000);
      assert.equal(search.results.length, 20);
      assert.equal(search.searches_remaining, 0);
      const replay = (
        await request(`/api/saved-briefs/${saved}/rerun`, {
          method: "POST",
          body: {},
          headers: { "Idempotency-Key": "free-operation-01" },
        })
      ).data;
      assert.equal(replay.search_id, search.search_id);
      await request(`/api/saved-briefs/${saved}/rerun`, {
        method: "POST",
        body: {},
        status: 402,
      });
      await request(`/api/search/${search.search_id}/rerun`, {
        method: "POST",
        body: { filters: empty },
        status: 402,
      });
      await request(`/api/search/${search.search_id}`, { as: b, status: 404 });
      await request(`/api/search/${search.search_id}?page=0`, { status: 400 });
      const expected =
        await sql`select candidate_id from public.search_results where search_id=${search.search_id} order by position`;
      const ids = [];
      const timings = [];
      for (let page = 1; page <= Math.ceil(search.total / 20); page++) {
        const next = await request(
          `/api/search/${search.search_id}?page=${page}`,
        );
        ids.push(...next.data.results.map((person) => person.id));
        timings.push(next.ms);
      }
      assert.equal(new Set(ids).size, search.total);
      assert.deepEqual(
        ids,
        expected.map((row) => row.candidate_id),
      );
      assert.equal((await request("/api/plan")).data.searches_remaining, 0);
      timings.sort((x, y) => x - y);
      console.log(
        JSON.stringify({
          paging_samples: timings.length,
          p50_ms: Math.round(timings[Math.floor(timings.length / 2)]),
          p95_ms: Math.round(timings[Math.floor(timings.length * 0.95)]),
        }),
      );
    },
  );

  await t.test(
    "signed billing deduplicates, orders events, and preserves free usage",
    async () => {
      await request("/api/billing/events", {
        as: null,
        method: "POST",
        body: "{}",
        status: 400,
      });
      const id = await billing(200, "active");
      await billing(200, "active", "customer.subscription.updated", id);
      assert.deepEqual((await request("/api/plan")).data, {
        plan: "paid",
        searches_remaining: null,
      });
      await billing(100, "incomplete", "customer.subscription.created");
      assert.equal((await request("/api/plan")).data.plan, "paid");
      const result = (
        await request(`/api/saved-briefs/${saved}/rerun`, {
          method: "POST",
          body: {},
        })
      ).data;
      assert.notEqual(result.search_id, search.search_id);
      assert.equal(result.searches_remaining, null);
      await billing(300, "canceled", "customer.subscription.deleted");
      await billing(250, "active");
      assert.deepEqual((await request("/api/plan")).data, {
        plan: "free",
        searches_remaining: 0,
      });
      await request(`/api/saved-briefs/${saved}/rerun`, {
        method: "POST",
        body: {},
        status: 402,
      });
      for (let i = 0; i < 2; i++)
        await request(`/api/shortlists/${list}/people/cand_0001`, {
          method: "DELETE",
        });
      assert.equal(
        (await request(`/api/shortlists/${list}`)).data.people.length,
        0,
      );
      await request(`/api/shortlists/${list}`, { method: "DELETE" });
      await request(`/api/search/${search.search_id}`);
      const [event] =
        await sql`select count(*)::int as n from private.billing_events where event_id=${id}`;
      assert.equal(event.n, 1);
    },
  );

  if (process.env.ROTTO_LIVE_GEMINI === "1")
    await t.test(
      "free Gemini search and a repeated HTTP delivery",
      async () => {
        const key = `live-${randomUUID()}`;
        const body = {
          brief:
            "senior React engineers in New York who have worked at a startup",
        };
        const result = await request("/api/search", {
          as: b,
          method: "POST",
          body,
          headers: { "Idempotency-Key": key },
        });
        assert.equal(result.data.total, 21);
        const replay = await request("/api/search", {
          as: b,
          method: "POST",
          body,
          headers: { "Idempotency-Key": key },
        });
        assert.equal(replay.data.search_id, result.data.search_id);
        console.log(
          JSON.stringify({ free_gemini_search_ms: Math.round(result.ms) }),
        );
      },
    );
});
