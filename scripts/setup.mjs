import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const execute = promisify(execFile);

async function supabase(...args) {
  try {
    return await execute(
      process.execPath,
      [resolve(root, "node_modules/supabase/dist/supabase.js"), ...args],
      { cwd: root, maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (error) {
    throw new Error(
      `Supabase ${args[0]} failed. ${error.stderr?.trim() ?? ""}`,
    );
  }
}

async function install() {
  await new Promise((resolvePromise, reject) => {
    const windows = process.platform === "win32";
    const child = spawn(
      windows
        ? "npm ci --include=dev --include=optional --no-audit --no-fund"
        : "npm",
      windows
        ? []
        : [
            "ci",
            "--include=dev",
            "--include=optional",
            "--no-audit",
            "--no-fund",
          ],
      {
        cwd: root,
        stdio: "inherit",
        shell: windows,
      },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolvePromise() : reject(new Error("npm ci failed.")),
    );
  });
}

async function setup() {
  if (process.versions.node.split(".")[0] !== "24") {
    throw new Error("Use Node 24 for this assessment.");
  }
  const candidatesPath = resolve(
    root,
    process.env.CANDIDATES_PATH ??
      (existsSync(resolve(root, "candidates.json"))
        ? "candidates.json"
        : "data/candidates.json"),
  );
  await access(candidatesPath).catch(() => {
    throw new Error(
      "Candidate data is missing. Supply data/candidates.json or candidates.json, or set CANDIDATES_PATH.",
    );
  });
  await execute("docker", ["version", "--format", "{{.Server.Version}}"], {
    cwd: root,
    timeout: 30000,
  }).catch(() => {
    throw new Error("Start Docker Desktop and ensure docker is on PATH.");
  });

  console.log("Installing locked dependencies...");
  await install();
  console.log("Starting local Supabase...");
  await supabase("start", "--output", "json");
  console.log("Applying pending migrations...");
  await supabase("migration", "up", "--local");

  const { stdout } = await supabase("status", "--output", "json");
  const status = JSON.parse(stdout);
  const settings = {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY,
    DATABASE_URL: status.DB_URL,
  };
  for (const value of Object.values(settings)) {
    if (typeof value !== "string" || !value) {
      throw new Error("Supabase status is missing local connection settings.");
    }
  }

  console.log("Seeding candidates and recruiter accounts...");
  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [resolve(root, "scripts/seed.mjs")], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, CANDIDATES_PATH: candidatesPath },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error("Database seed failed.")),
    );
  });

  const envPath = resolve(root, ".env.local");
  const existing = await readFile(envPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const keys = new Set(Object.keys(settings));
  const preserved = existing
    .split(/\r?\n/)
    .filter(
      (line) => !keys.has(line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=/)?.[1]),
    )
    .join("\n")
    .trimEnd();
  const generated = Object.entries(settings)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n");
  await writeFile(
    envPath,
    `${preserved ? `${preserved}\n\n` : ""}${generated}\n`,
    {
      mode: 0o600,
    },
  );
  console.log("Local connections saved to .env.local. Run make dev.");
}

setup().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
