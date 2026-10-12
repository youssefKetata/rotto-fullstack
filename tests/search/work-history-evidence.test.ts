import assert from "node:assert/strict";
import test from "node:test";
import { workHistoryEvidence } from "../../src/components/search/work-history-evidence";
import type { Candidate } from "../../src/lib/search/types";

const job = (
  position: number,
  company_type: string,
  end_year: number | null,
  company_name = "Globalcorp",
  title = "Staff Engineer",
): Candidate["experiences"][number] => ({
  position,
  company_type,
  company_name,
  title,
  end_year,
  start_year: 2010,
  company_logo_url: "",
  description: "",
});

test("company evidence appears only for a requested, positive company type", () => {
  const candidate = { experiences: [job(0, "enterprise", null)] };
  assert.deepEqual(workHistoryEvidence(candidate), []);
  assert.deepEqual(
    workHistoryEvidence(candidate, [
      { scope: "any", companyTypes: ["enterprise"], exclude: true },
    ]),
    [],
  );
  assert.deepEqual(
    workHistoryEvidence(candidate, [
      { scope: "any", companyTypes: ["startup"] },
    ]),
    [],
  );
});

test("an any-job match prefers a current employer but past scope uses past work", () => {
  const past = job(0, "enterprise", 2020);
  const current = job(1, "enterprise", null, "Titan");
  const candidate = { experiences: [past, current] };
  assert.deepEqual(
    workHistoryEvidence(candidate, [
      { scope: "any", companyTypes: ["enterprise"] },
    ]),
    [current],
  );
  assert.deepEqual(
    workHistoryEvidence(candidate, [
      { scope: "past", companyTypes: ["enterprise"] },
    ]),
    [past],
  );
});

test("a past enterprise employer never becomes evidence for current enterprise work", () => {
  const candidate = {
    experiences: [job(0, "startup", null), job(1, "enterprise", 2020)],
  };
  assert.deepEqual(
    workHistoryEvidence(candidate, [
      { scope: "current", companyTypes: ["enterprise"] },
    ]),
    [],
  );
});

test("company type, employer and title must belong to the same job", () => {
  const candidate = {
    experiences: [
      job(0, "startup", null, "Globalcorp", "Designer"),
      job(1, "enterprise", 2020, "Titan"),
    ],
  };
  assert.deepEqual(
    workHistoryEvidence(candidate, [
      { scope: "any", companyTypes: ["enterprise"], companies: ["Globalcorp"] },
    ]),
    [],
  );
  assert.deepEqual(
    workHistoryEvidence(candidate, [
      { scope: "any", companyTypes: ["enterprise"], titles: ["Designer"] },
    ]),
    [],
  );
  assert.deepEqual(
    workHistoryEvidence(candidate, [
      {
        scope: "past",
        companyTypes: ["enterprise"],
        companies: ["TITAN"],
        titles: ["staff engineer"],
      },
    ]),
    [candidate.experiences[1]],
  );
});

test("multiple conditions retain distinct employers without duplicating one job", () => {
  const enterprise = job(0, "enterprise", null);
  const startup = job(1, "startup", 2020, "Cloudnine");
  assert.deepEqual(
    workHistoryEvidence({ experiences: [enterprise, startup] }, [
      { scope: "any", companyTypes: ["enterprise"] },
      { scope: "current", companyTypes: ["enterprise"] },
      { scope: "past", companyTypes: ["startup"] },
    ]),
    [enterprise, startup],
  );
});
