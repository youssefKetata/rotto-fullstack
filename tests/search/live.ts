// Explicitly opted-in free-tier evaluation, separate from ordinary tests.
// Reads shared local candidates through the SQL matcher; sends only briefs and vocabulary to Gemini.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { createGeminiInterpreter } from "../../src/lib/search/gemini";
import { matchingCandidates } from "../../src/lib/search/query";

async function main() {
  assert.equal(
    process.env.ROTTO_LIVE_GEMINI,
    "1",
    "Set ROTTO_LIVE_GEMINI=1 to allow ten free-tier requests.",
  );
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
  );
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    onnotice: () => {},
  });
  const queries = JSON.parse(
    readFileSync(new URL("../../data/queries.json", import.meta.url), "utf8"),
  ) as { brief: string; expected_ids: string[] }[];
  const original = globalThis.fetch;
  let tokens:
    { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
  const interpret = createGeminiInterpreter({
    fetch: async (...args) => {
      const response = await original(...args);
      if (response.ok) tokens = (await response.clone().json()).usageMetadata;
      return response;
    },
  });
  let passed = 0;
  try {
    for (const [index, query] of queries.entries()) {
      const started = performance.now();
      try {
        const filters = await interpret(query.brief);
        const rows = await matchingCandidates(sql, filters);
        const ids = rows.map((row) => row.id).sort();
        const expected = [...query.expected_ids].sort();
        const correct = JSON.stringify(ids) === JSON.stringify(expected);
        if (correct) passed++;
        console.log(
          JSON.stringify({
            query: index + 1,
            correct,
            expected: expected.length,
            actual: ids.length,
            ms: Math.round(performance.now() - started),
            tokens,
            filters,
          }),
        );
      } catch (error) {
        console.log(
          JSON.stringify({
            query: index + 1,
            correct: false,
            code: (error as { code?: string }).code ?? "evaluation_failed",
          }),
        );
      }
    }
    console.log(
      JSON.stringify({ exact_sets_passed: passed, total: queries.length }),
    );
    assert.equal(passed, queries.length);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
void main().catch(() => {
  console.error("Free-tier evaluation failed.");
  process.exitCode = 1;
});
