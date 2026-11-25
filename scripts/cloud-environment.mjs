import { spawn, spawnSync } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = resolve(root, "node_modules/supabase/dist/supabase.js");
const next = resolve(root, "node_modules/next/dist/bin/next");
const log = resolve(tmpdir(), "rotto-next-dev.log");

function run(script, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed.`);
}

async function ready() {
  try {
    return (
      await fetch("http://127.0.0.1:3000/login", {
        signal: AbortSignal.timeout(2000),
      })
    ).ok;
  } catch {
    return false;
  }
}

async function main() {
  if (process.env.CODESPACES !== "true") {
    throw new Error(
      "This command runs inside GitHub Codespaces, not on your laptop.",
    );
  }
  if (process.argv[2] === "setup") {
    run(resolve(root, "scripts/setup.mjs"));
    const path = resolve(root, ".env.local");
    let env = await readFile(path, "utf8");
    // Only development secrets explicitly supplied to this Codespace are imported.
    const settings = {
      STRIPE_WEBHOOK_SECRET:
        process.env.STRIPE_WEBHOOK_SECRET || "whsec_rotto_assessment_sample",
      ...(process.env.GEMINI_API_KEY
        ? { GEMINI_API_KEY: process.env.GEMINI_API_KEY }
        : {}),
    };
    for (const [key, value] of Object.entries(settings)) {
      if (!new RegExp(`^${key}=`, "m").test(env)) {
        env += `${key}=${JSON.stringify(value)}\n`;
      }
    }
    await writeFile(path, env, { mode: 0o600 });
    console.log(
      "Cloud database and demo accounts are ready. Production was not accessed.",
    );
    return;
  }
  if (process.argv[2] !== "start") throw new Error("Use setup or start.");
  run(cli, "start");
  if (await ready()) return;
  const output = openSync(log, "a", 0o600);
  const child = spawn(
    process.execPath,
    [next, "dev", "--hostname", "0.0.0.0", "--port", "3000"],
    {
      cwd: root,
      detached: true,
      stdio: ["ignore", output, output],
    },
  );
  closeSync(output);
  await new Promise((resolveStarted, reject) => {
    child.once("spawn", resolveStarted);
    child.once("error", reject);
  });
  child.unref();
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await ready()) {
      console.log(
        "Rotto is ready on port 3000. Use the private CLI tunnels described in docs/cloud-development.md.",
      );
      return;
    }
    await setTimeout(1000);
  }
  throw new Error(`Rotto did not start. Inspect ${log}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
