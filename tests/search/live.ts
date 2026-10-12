// Explicitly opted-in free-tier evaluation, separate from ordinary tests.
// Reads shared local candidates through the SQL matcher; sends only briefs and vocabulary to Gemini.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { createGeminiInterpreter } from "../../src/lib/search/gemini";
import { matchingCandidates } from "../../src/lib/search/query";
import type { SearchCriteria } from "../../src/lib/search/schema";
import { regressionCases } from "./regression-cases";

async function main() {
  assert.equal(
    process.env.ROTTO_LIVE_GEMINI,
    "1",
    "Set ROTTO_LIVE_GEMINI=1 to allow the free-tier evaluation requests.",
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
  const referenceQueries = JSON.parse(
    readFileSync(new URL("../../data/queries.json", import.meta.url), "utf8"),
  ) as { brief: string; expected_ids: string[] }[];
  const queries: {
    name: string;
    brief: string;
    expected_ids: string[];
    expected_first_page?: string[];
    issue?: "required" | "optional" | "none";
    excluded_fields?: (keyof SearchCriteria)[];
    expected_continued_ids?: string[];
    expected_role_family?: string[];
  }[] = [
    ...referenceQueries.map((query, index) => ({
      ...query,
      name: `reference-${index + 1}`,
    })),
    ...regressionCases,
  ].filter(
    (query) =>
      !process.env.ROTTO_LIVE_CASE ||
      process.env.ROTTO_LIVE_CASE.split(",").includes(query.name),
  );
  assert.ok(queries.length, "No matching evaluation case.");
  const original = globalThis.fetch;
  let providerStatus: number | undefined;
  let providerLimits: { metric?: string; retryDelay?: string }[] = [];
  let tokens:
    { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
  const interpret = createGeminiInterpreter({
    fetch: async (...args) => {
      const response = await original(...args);
      providerStatus = response.status;
      if (response.ok) tokens = (await response.clone().json()).usageMetadata;
      else {
        const body = await response
          .clone()
          .json()
          .catch(() => null);
        providerLimits = (body?.error?.details ?? []).flatMap(
          (detail: {
            retryDelay?: string;
            violations?: { quotaMetric?: string }[];
          }) => [
            ...(detail.retryDelay ? [{ retryDelay: detail.retryDelay }] : []),
            ...(detail.violations ?? []).map((item) => ({
              metric: item.quotaMetric,
            })),
          ],
        );
      }
      return response;
    },
  });
  let passed = 0;
  try {
    for (const [index, query] of queries.entries()) {
      if (index > 0) {
        // Evaluation pacing only; production requests keep their latency budget.
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      providerStatus = undefined;
      providerLimits = [];
      tokens = undefined;
      const started = performance.now();
      try {
        const filters = await interpret(query.brief);
        // Match through an initialized transaction, as the production service
        // does, so Postgres.js has loaded its array serializers before binding.
        const rows = await sql.begin((transaction) =>
          matchingCandidates(transaction, filters),
        );
        const ids = rows.map((row) => row.id).sort();
        const expected = [...query.expected_ids].sort();
        const rankedIds = [...rows]
          .sort(
            (left, right) =>
              right.preference_score - left.preference_score ||
              right.years_experience - left.years_experience ||
              left.id.localeCompare(right.id),
          )
          .slice(0, 20)
          .map((row) => row.id);
        const setCorrect = JSON.stringify(ids) === JSON.stringify(expected);
        const rankingCorrect =
          !query.expected_first_page ||
          JSON.stringify(rankedIds) ===
            JSON.stringify(query.expected_first_page);
        const issueCorrect =
          !query.issue ||
          (query.issue === "none"
            ? filters.issues.length === 0
            : filters.issues.some(
                (issue) => issue.required === (query.issue === "required"),
              ));
        const fieldsCorrect = !query.excluded_fields?.some((field) =>
          [...filters.anyOf, ...filters.preferred].some(
            (criteria) => criteria[field] !== undefined,
          ),
        );
        const roleFamilyCorrect =
          !query.expected_role_family ||
          filters.anyOf.every(
            (criteria) =>
              !criteria.roles ||
              JSON.stringify([...criteria.roles].sort()) ===
                JSON.stringify(query.expected_role_family),
          );
        const continuedIds = query.expected_continued_ids
          ? (
              await sql.begin((transaction) =>
                matchingCandidates(transaction, { ...filters, issues: [] }),
              )
            )
              .map((row) => row.id)
              .sort()
          : undefined;
        const continuationCorrect =
          !query.expected_continued_ids ||
          JSON.stringify(continuedIds) ===
            JSON.stringify(query.expected_continued_ids);
        const correct =
          setCorrect &&
          rankingCorrect &&
          issueCorrect &&
          fieldsCorrect &&
          roleFamilyCorrect &&
          continuationCorrect;
        if (correct) passed++;
        console.log(
          JSON.stringify({
            query: index + 1,
            name: query.name,
            brief: query.brief,
            correct,
            setCorrect,
            rankingCorrect,
            issueCorrect,
            fieldsCorrect,
            roleFamilyCorrect,
            continuationCorrect,
            ...(continuedIds
              ? {
                  continued: continuedIds.length,
                  expectedContinued: query.expected_continued_ids?.length,
                }
              : {}),
            expected: expected.length,
            actual: ids.length,
            ms: Math.round(performance.now() - started),
            tokens,
            filters,
            ...(!setCorrect
              ? {
                  missing: expected
                    .filter((id) => !ids.includes(id))
                    .slice(0, 20),
                  unexpected: ids
                    .filter((id) => !expected.includes(id))
                    .slice(0, 20),
                }
              : {}),
          }),
        );
      } catch (error) {
        console.log(
          JSON.stringify({
            query: index + 1,
            name: query.name,
            correct: false,
            code: (error as { code?: string }).code ?? "evaluation_failed",
            providerStatus,
            providerLimits,
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
