import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createServerClient } from "@supabase/ssr";
import { createClient, type Session } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { getRecruiter } from "../../src/lib/supabase/auth";
import { getSupabaseConfig } from "../../src/lib/supabase/config";
import { proxy } from "../../src/proxy";

process.loadEnvFile(".env.local");
const { url, key } = getSupabaseConfig();
const sessions: Session[] = [];

before(async () => {
  for (const company of ["acme", "globex"]) {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: `recruiter@${company}.test`,
      password: "rotto-assessment",
    });
    assert.equal(error?.code, undefined);
    assert.ok(data.session);
    sessions.push(data.session);
  }
});

function request(token?: string) {
  return new Request("http://localhost:3000/api/plan", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

test("Bearer clients retain each recruiter's RLS identity", async () => {
  const contexts = await Promise.all(
    sessions.map((session) => getRecruiter(request(session.access_token))),
  );
  assert.ok(contexts[0]);
  assert.ok(contexts[1]);
  assert.notEqual(
    contexts[0].recruiter.company_id,
    contexts[1].recruiter.company_id,
  );

  for (let i = 0; i < contexts.length; i++) {
    const context = contexts[i]!;
    assert.equal(context.recruiter.id, sessions[i].user.id);
    const { data, error } = await context.supabase
      .from("companies")
      .select("id");
    assert.equal(error?.code, undefined);
    assert.deepEqual(data, [{ id: context.recruiter.company_id }]);

    const otherCompany = contexts[1 - i]!.recruiter.company_id;
    const other = await context.supabase
      .from("recruiters")
      .select("id")
      .eq("company_id", otherCompany);
    assert.equal(other.error?.code, undefined);
    assert.deepEqual(other.data, []);
  }
});

test("missing, malformed and forged Bearer tokens fail closed", async () => {
  const parts = sessions[0].access_token.split(".");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  payload.sub = sessions[1].user.id;
  parts[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");

  for (const token of [
    undefined,
    "invalid",
    "e30.bm90LWpzb24.eA",
    parts.join("."),
  ]) {
    assert.equal((await getRecruiter(request(token))) === null, true);
  }
  const cookieRequest = new Request("http://localhost:3000/api/plan", {
    headers: { Cookie: "some-session=present", Authorization: "Basic invalid" },
  });
  assert.equal((await getRecruiter(cookieRequest)) === null, true);
});

test("Proxy refreshes cookies for the browser and downstream server", async () => {
  const cookieName = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const staleSession = { ...sessions[0], expires_at: 1 };
  const value = `base64-${Buffer.from(JSON.stringify(staleSession)).toString("base64url")}`;
  const incoming = new NextRequest("http://localhost:3000/", {
    headers: { Cookie: `${cookieName}=${value}` },
  });
  const response = await proxy(incoming);
  assert.ok(
    response.cookies
      .getAll()
      .some((cookie) => cookie.name.startsWith(cookieName)),
  );
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");

  const forwardedCookies = incoming.cookies.getAll();
  assert.ok(response.headers.get("x-middleware-request-cookie"));
  const refreshed = createServerClient(url, key, {
    cookies: {
      getAll: () => forwardedCookies,
      setAll: () =>
        assert.fail("Downstream must receive an already refreshed session"),
    },
  });
  const { data, error } = await refreshed.auth.getSession();
  assert.equal(error?.code, undefined);
  assert.ok(data.session);
  assert.notEqual(
    data.session.refresh_token === sessions[0].refresh_token,
    true,
  );
  assert.ok(data.session.expires_at! > Date.now() / 1000);
  const verified = await refreshed.auth.getUser();
  assert.equal(verified.error?.code, undefined);
  assert.equal(verified.data.user?.id, sessions[0].user.id);
});

test("Proxy preserves refreshed session cookies and cache headers on login redirects", async () => {
  const cookieName = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const staleSession = { ...sessions[1], expires_at: 1 };
  const value = `base64-${Buffer.from(JSON.stringify(staleSession)).toString("base64url")}`;
  const incoming = new NextRequest("http://localhost:3000/login", {
    headers: { Cookie: `${cookieName}=${value}` },
  });
  const response = await proxy(incoming);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost:3000/");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.ok(
    response.cookies
      .getAll()
      .some((cookie) => cookie.name.startsWith(cookieName)),
  );
  const refreshed = createServerClient(url, key, {
    cookies: {
      getAll: () => response.cookies.getAll(),
      setAll: () =>
        assert.fail("Redirect must deliver an already refreshed session"),
    },
  });
  const verified = await refreshed.auth.getUser();
  assert.equal(verified.error, null);
  assert.equal(verified.data.user?.id, sessions[1].user.id);
});
