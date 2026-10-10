import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import postgres from "postgres";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = promisify(execFile);
const accounts = [
  { company: "acme", email: "recruiter@acme.test" },
  { company: "globex", email: "recruiter@globex.test" },
];

export const stagingSql = `
  create temporary table seed_candidates on commit drop as
  select * from jsonb_to_recordset($1::jsonb) as candidate (
    id text, full_name text, headline text, avatar_url text,
    current_title text, current_company text, current_company_logo_url text,
    role text, seniority text, years_experience integer,
    location jsonb, open_to_work boolean, skills text[],
    experiences jsonb, education jsonb
  )
`;

function validateCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("Candidate input must be a nonempty JSON array.");
  }
  const ids = new Set();
  for (const candidate of candidates) {
    if (
      !candidate ||
      typeof candidate.id !== "string" ||
      !candidate.id.trim() ||
      ids.has(candidate.id)
    ) {
      throw new Error("Every candidate must have a unique, nonempty text ID.");
    }
    for (const field of ["skills", "experiences", "education"]) {
      if (!Array.isArray(candidate[field])) {
        throw new Error(
          `Candidate ${candidate.id}: ${field} must be an array.`,
        );
      }
    }
    ids.add(candidate.id);
  }
}

function requireLocalUrl(value) {
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("The assessment seed only supports local Supabase.");
  }
  return value;
}

async function seed() {
  const inputPath = resolve(
    root,
    process.env.CANDIDATES_PATH ?? "data/candidates.json",
  );
  const candidates = JSON.parse(await readFile(inputPath, "utf8"));
  validateCandidates(candidates);

  let status;
  try {
    const cli = resolve(root, "node_modules/supabase/dist/supabase.js");
    const { stdout } = await run(
      process.execPath,
      [cli, "status", "--output", "json"],
      { cwd: root },
    );
    status = JSON.parse(stdout);
  } catch {
    throw new Error(
      "Local Supabase is unavailable. Run npx supabase start first and ensure Docker is on PATH.",
    );
  }
  const apiUrl = requireLocalUrl(status.API_URL);
  const dbUrl = requireLocalUrl(status.DB_URL);
  if (!status.SERVICE_ROLE_KEY)
    throw new Error(
      "Supabase status did not provide its local service-role key.",
    );
  const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });

  try {
    const baseSql = await readFile(resolve(root, "supabase/seed.sql"), "utf8");
    const candidateSql = await readFile(
      resolve(root, "supabase/seed-candidates.sql"),
      "utf8",
    );
    const result = await sql.begin(async (tx) => {
      await tx.unsafe(baseSql).simple();
      await tx.unsafe(stagingSql, [tx.json(candidates)]);
      await tx.unsafe(candidateSql).simple();

      for (const account of accounts) {
        const [existing] =
          await tx`select id from auth.users where lower(email) = ${account.email} and deleted_at is null`;
        const endpoint = existing
          ? `/auth/v1/admin/users/${existing.id}`
          : "/auth/v1/admin/users";
        const response = await fetch(new URL(endpoint, apiUrl), {
          method: existing ? "PUT" : "POST",
          headers: {
            apikey: status.SERVICE_ROLE_KEY,
            Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: account.email,
            password: "rotto-assessment",
            email_confirm: true,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok)
          throw new Error(
            `Could not seed ${account.email}: Auth returned ${response.status}.`,
          );
        const user = await response.json();
        if (!user.id)
          throw new Error(
            `Auth did not return a user ID for ${account.email}.`,
          );
        const [company] =
          await tx`select id from public.companies where slug = ${account.company}`;
        await tx`insert into public.recruiters (id, company_id) values (${user.id}, ${company.id}) on conflict (id) do nothing`;
        const [membership] =
          await tx`select company_id from public.recruiters where id = ${user.id}`;
        if (membership.company_id !== company.id)
          throw new Error(
            `${account.email} already belongs to a different company.`,
          );
      }

      const [counts] = await tx`
        select (select count(*)::integer from public.candidates) as candidates,
          (select count(*)::integer from public.candidate_experiences) as experiences,
          (select count(*)::integer from public.candidate_education) as education
      `;
      return counts;
    });
    await sql`analyze public.candidates, public.candidate_experiences, public.candidate_education`;
    console.log(
      `Seeded ${candidates.length} input candidates and both recruiter accounts.`,
    );
    console.log(
      `Database: ${result.candidates} candidates, ${result.experiences} experiences, ${result.education} education records.`,
    );
  } finally {
    await sql.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  seed().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
