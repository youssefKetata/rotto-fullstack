import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
process.loadEnvFile(resolve(root, ".env.local"));
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL"]) {
  const host = new URL(process.env[name]).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
    throw new Error(
      "Cloud checks require the disposable local Supabase stack, never a hosted production database.",
    );
  }
}
delete process.env.ROTTO_LIVE_GEMINI;
process.env.GEMINI_API_KEY = "cloud-checks-do-not-call-provider";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_rotto_assessment_sample";
process.env.ROTTO_TEST_BASE_URL = "http://localhost:3100";
const npm = resolve(
  process.env.npm_execpath || "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
);

function check(script) {
  console.log(`\nChecking ${script}...`);
  const result = spawnSync(process.execPath, [npm, "run", script], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed.`);
}

let server;
try {
  for (const script of [
    "build",
    "lint",
    "typecheck",
    "format:check",
    "test:http",
    "test:auth-unit",
    "test:search-unit",
    "test:db",
    "test:shortlists",
    "test:connection",
  ]) {
    check(script);
  }
  const output = openSync(resolve(tmpdir(), "rotto-ci-next.log"), "w", 0o600);
  server = spawn(
    process.execPath,
    [
      resolve(root, "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "0.0.0.0",
      "--port",
      "3100",
    ],
    {
      cwd: root,
      env: process.env,
      stdio: ["ignore", output, output],
    },
  );
  closeSync(output);
  server.on("error", (error) => console.error(error.message));
  let healthy = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (server.exitCode !== null) break;
    try {
      healthy = (
        await fetch(`${process.env.ROTTO_TEST_BASE_URL}/login`, {
          signal: AbortSignal.timeout(2000),
        })
      ).ok;
    } catch {
      /* Wait for the production server to bind. */
    }
    if (healthy) break;
    await setTimeout(1000);
  }
  if (!healthy)
    throw new Error(
      "Production test server did not start. Inspect /tmp/rotto-ci-next.log.",
    );
  check("test:auth");
  check("test:api");
  console.log("\nAll cloud checks passed. No live Gemini calls were made.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  server?.kill("SIGTERM");
}
