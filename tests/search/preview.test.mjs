import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = process.env.TEST_APP_URL ?? "http://localhost:3000";
const profiles = JSON.parse(
  await readFile(
    new URL("../../data/candidates.json", import.meta.url),
    "utf8",
  ),
);

async function session(company = "acme") {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `recruiter@${company}.test`,
      password: "rotto-assessment",
    }),
  });
  assert.equal(response.status, 200);
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

async function query(cookie, filters, page = 1) {
  return fetch(`${base}/api/preview/candidates`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: base,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filters, page }),
  });
}

test("preview reads require recruiter access and validated nonempty filters", async () => {
  assert.equal((await query("", { skills: ["React"] })).status, 401);
  assert.equal(
    (await fetch(`${base}/api/preview/candidates/cand_0001`)).status,
    401,
  );
  const cookie = await session();
  for (const filters of [
    { skills: [] },
    { skills: ["unknown"] },
    { skills: [], minYears: -1 },
    { skills: [], company_id: "another-company" },
  ])
    assert.equal((await query(cookie, filters)).status, 400);
});

test("database results match the supplied data, with stable paging and full profile relations", async () => {
  const cookie = await session();
  const filters = {
    skills: ["React", "TypeScript"],
    role: "Frontend Engineer",
  };
  const expected = profiles
    .filter(
      (c) =>
        c.role === filters.role &&
        filters.skills.every((skill) => c.skills.includes(skill)),
    )
    .sort(
      (a, b) =>
        Number(b.open_to_work) - Number(a.open_to_work) ||
        b.years_experience - a.years_experience ||
        a.id.localeCompare(b.id),
    );
  for (const page of [1, 2]) {
    const response = await query(cookie, filters, page);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.equal(body.total, expected.length);
    assert.deepEqual(
      body.results.map((c) => c.id),
      expected.slice((page - 1) * 20, page * 20).map((c) => c.id),
    );
    assert.equal(
      body.results[0].experiences.length,
      expected[(page - 1) * 20].experiences.length,
    );
  }
  const profile = await fetch(
    `${base}/api/preview/candidates/${expected[0].id}`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(profile.status, 200);
  assert.equal(
    (await profile.json()).education.length,
    expected[0].education.length,
  );
});

test("background and education filters query real relations without truncating profile history", async () => {
  const cookie = await session("globex");
  const filters = {
    skills: ["Python", "SQL"],
    role: "Data Scientist",
    companyType: "startup",
    field: "Computer Science",
  };
  const expected = profiles.filter(
    (c) =>
      c.role === filters.role &&
      filters.skills.every((s) => c.skills.includes(s)) &&
      c.experiences.some((e) => e.company_type === filters.companyType) &&
      c.education.some((e) => e.field === filters.field),
  );
  const response = await query(cookie, filters);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.total, expected.length);
  for (const candidate of body.results) {
    assert.ok(expected.some((c) => c.id === candidate.id));
    assert.equal(
      candidate.experiences.length,
      expected.find((c) => c.id === candidate.id).experiences.length,
    );
  }
});
