import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const base = "http://localhost:3000";
function login(body, headers = {}, requestBase = base) {
  return fetch(`${requestBase}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: requestBase,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("Proxy redirects guests before rendering, while login serves the complete form", async () => {
  for (const headers of [{}, { Authorization: "Bearer invalid" }]) {
    const root = await fetch(base, { redirect: "manual", headers });
    assert.equal(root.status, 307);
    assert.equal(
      new URL(root.headers.get("location"), base).href,
      `${base}/login`,
    );
    assert.equal(root.headers.get("cache-control"), "private, no-store");
  }
  const page = await fetch(`${base}/login`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('name="email"'));
  assert.ok(html.includes('name="password"'));
  assert.ok(!html.includes("Loading sign-in"));
});

test("login rejects invalid input, wrong credentials and cross-origin requests", async () => {
  assert.equal((await login("{")).status, 400);
  assert.equal(
    (await login({ email: "invalid", password: "wrong" })).status,
    400,
  );
  const invalid = await login({
    email: "recruiter@acme.test",
    password: "wrong",
  });
  assert.equal(invalid.status, 401);
  assert.deepEqual(await invalid.json(), {
    error: "Email or password is incorrect.",
  });
  assert.equal(
    (await login({}, { Origin: "https://example.com" })).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/api/auth/logout`, {
        method: "POST",
        headers: { Origin: "https://example.com" },
      })
    ).status,
    403,
  );
});

test("auth endpoints accept public browser origins and reject cross-origin requests behind a proxy", async () => {
  for (const { url, origin, headers } of [
    {
      url: "http://127.0.0.1:3000",
      origin: "http://127.0.0.1:3000",
      headers: {},
    },
    {
      url: base,
      origin: "https://rotto.example.com",
      headers: {
        "X-Forwarded-Host": "rotto.example.com",
        "X-Forwarded-Proto": "https",
      },
    },
  ]) {
    const accepted = await login({}, { ...headers, Origin: origin }, url);
    assert.equal(accepted.status, 400);
    const logout = await fetch(`${url}/api/auth/logout`, {
      method: "POST",
      headers: { ...headers, Origin: origin },
    });
    assert.equal(logout.status, 200);

    const rejectedHeaders = { ...headers, Origin: "https://attacker.test" };
    assert.equal((await login({}, rejectedHeaders, url)).status, 403);
    const rejectedLogout = await fetch(`${url}/api/auth/logout`, {
      method: "POST",
      headers: rejectedHeaders,
    });
    assert.equal(rejectedLogout.status, 403);
  }
});

test("both seeded recruiters get their own workspace and can sign out", async () => {
  for (const [slug, name] of [
    ["acme", "Acme"],
    ["globex", "Globex"],
  ]) {
    const response = await login({
      email: `recruiter@${slug}.test`,
      password: "rotto-assessment",
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { ok: true });
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    assert.ok(cookie);
    const signInPage = await fetch(`${base}/login`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    assert.equal(signInPage.status, 307);
    assert.equal(
      new URL(signInPage.headers.get("location"), base).href,
      `${base}/`,
    );
    assert.equal(signInPage.headers.get("cache-control"), "private, no-store");
    const workspace = await fetch(base, { headers: { Cookie: cookie } });
    assert.equal(workspace.status, 200);
    const html = (await workspace.text()).replace(/<!--.*?-->/gs, "");
    assert.ok(html.includes(`${name} account`));
    assert.ok(html.includes("Describe who"));

    const logout = await fetch(`${base}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: base },
    });
    assert.equal(logout.status, 200);
    assert.deepEqual(await logout.json(), { ok: true });
    assert.ok(
      logout.headers
        .getSetCookie()
        .some((value) => value.includes("Max-Age=0")),
    );
  }
});

test("signed-in users without recruiter membership see access feedback without a redirect loop", async () => {
  process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  );
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `proxy-access-${randomUUID()}@test.invalid`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.equal(error, null);
  assert.ok(data.user);
  try {
    const cookies = new Map();
    const client = createServerClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
          setAll: (values) =>
            values.forEach(({ name, value }) => cookies.set(name, value)),
        },
      },
    );
    const session = await client.auth.signInWithPassword({ email, password });
    assert.equal(session.error, null);
    const cookie = [...cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
    const signInPage = await fetch(`${base}/login`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    assert.equal(signInPage.status, 307);
    assert.equal(
      new URL(signInPage.headers.get("location"), base).href,
      `${base}/`,
    );
    const root = await fetch(base, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    assert.equal(root.status, 200);
    const html = await root.text();
    assert.ok(html.includes("Recruiter access required."));
    assert.ok(!html.includes("NEXT_REDIRECT"));
    const rejected = await login({ email, password });
    assert.equal(rejected.status, 403);
    assert.ok(
      rejected.headers
        .getSetCookie()
        .some((value) => value.includes("Max-Age=0")),
    );
  } finally {
    const deleted = await admin.auth.admin.deleteUser(data.user.id);
    assert.equal(deleted.error, null);
  }
});
