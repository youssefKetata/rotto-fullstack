import assert from "node:assert/strict";
import { test } from "node:test";
import {
  searchVocabulary,
  validateSearchFilters,
  type SearchFilters,
} from "../../src/lib/search/schema";
import {
  canExclude,
  changeTokenState,
  removeEditorToken,
  removeEditorTokens,
  setSkillMode,
  tokenState,
} from "../../src/components/search/requirement-editor-model";

function filters(): SearchFilters {
  return {
    version: 1,
    anyOf: [
      {
        roles: ["Product Manager"],
        skillsAll: ["Python", "SQL"],
        minYears: 3,
        maxYears: 12,
      },
      { skillsAll: ["React"] },
    ],
    preferred: [{ seniorities: ["mid"], openToWork: true }],
    issues: [
      {
        text: "Japanese language proficiency is not recorded.",
        kind: "unsupported",
        required: true,
      },
    ],
  };
}

test("marking one skill nice to have preserves accepted sets, compound preferences and unsupported requirements", () => {
  const original = filters();
  const next = changeTokenState(
    original,
    { group: "anyOf", index: 0, key: "skillsAll", valueIndex: 0 },
    "preferred",
    0,
    "all",
  );
  assert.deepEqual(next.anyOf[0].skillsAll, ["SQL"]);
  assert.deepEqual(next.anyOf[1], original.anyOf[1]);
  assert.deepEqual(next.preferred, [
    ...original.preferred,
    { skillsAll: ["Python"] },
  ]);
  assert.deepEqual(next.issues, original.issues);
  assert.deepEqual(
    original,
    filters(),
    "Editing must not mutate the loaded payload.",
  );
  assert.ok(validateSearchFilters(next));
});

test("exclusions use the existing role, level, skill and compound location fields", () => {
  for (const [key, excluded, value] of [
    ["roles", "excludeRoles", "Product Manager"],
    ["seniorities", "excludeSeniorities", "mid"],
    ["skillsAll", "skillsNone", "Python"],
    ["locations", "excludeLocations", { city: "New York", state: "NY" }],
  ] as const) {
    const original = {
      ...filters(),
      anyOf: [{ roles: ["Product Manager"], [key]: [value] }],
    } as SearchFilters;
    const next = changeTokenState(
      original,
      { group: "anyOf", index: 0, key, valueIndex: 0 },
      "exclude",
      0,
      "all",
    );
    assert.deepEqual(next.anyOf[0][excluded], [value]);
    assert.equal(next.anyOf[0][key], undefined);
    assert.ok(validateSearchFilters(next));
  }
});

test("promoting a preference returns only that value to the selected accepted set", () => {
  const original = filters();
  const next = changeTokenState(
    original,
    { group: "preferred", index: 0, key: "seniorities", valueIndex: 0 },
    "required",
    1,
    "all",
  );
  assert.deepEqual(next.anyOf[0], original.anyOf[0]);
  assert.deepEqual(next.anyOf[1], {
    skillsAll: ["React"],
    seniorities: ["mid"],
  });
  assert.deepEqual(next.preferred, [{ openToWork: true }]);
});

test("work history and education stay on the same record when their state changes", () => {
  const job = {
    scope: "current" as const,
    companyTypes: ["startup" as const],
    companies: [searchVocabulary.companies[0]],
    titles: [searchVocabulary.titles[0]],
  };
  const education = {
    degrees: [searchVocabulary.degrees[0]],
    schools: [searchVocabulary.schools[0]],
    fields: [searchVocabulary.fields[0]],
    minGraduationYear: 2000,
    maxGraduationYear: 2025,
  };
  const original: SearchFilters = {
    ...filters(),
    anyOf: [
      { roles: ["Product Manager"], experience: [job], education: [education] },
    ],
  };
  const next = changeTokenState(
    original,
    { group: "anyOf", index: 0, key: "experience", valueIndex: 0 },
    "preferred",
    0,
    "all",
  );
  assert.deepEqual(next.preferred.at(-1), { experience: [job] });
  assert.deepEqual(next.anyOf[0].education, [education]);
  const excluded = changeTokenState(
    next,
    { group: "anyOf", index: 0, key: "education", valueIndex: 0 },
    "exclude",
    0,
    "all",
  );
  assert.deepEqual(excluded.anyOf[0].education, [
    { ...education, exclude: true },
  ]);
  assert.ok(validateSearchFilters(excluded));
});

test("All / Any one only changes the selected required skills and retains exclusions", () => {
  const original = filters();
  original.anyOf[0].skillsNone = ["Go"];
  const next = setSkillMode(original, 0, "any");
  assert.deepEqual(next.anyOf[0].skillsAny, ["Python", "SQL"]);
  assert.equal(next.anyOf[0].skillsAll, undefined);
  assert.deepEqual(next.anyOf[0].skillsNone, ["Go"]);
  assert.deepEqual(next.anyOf[1], original.anyOf[1]);
  assert.deepEqual(next.preferred, original.preferred);
  assert.deepEqual(setSkillMode(next, 0, "all"), original);
});

test("mixed All and Any one rules are preserved until the user explicitly chooses a mode", () => {
  const original = filters();
  original.anyOf[0].skillsAny = ["React", "Go"];
  assert.equal(
    changeTokenState(
      original,
      { group: "anyOf", index: 0, key: "skillsAll", valueIndex: 0 },
      "required",
      0,
      "all",
    ),
    original,
  );
  assert.deepEqual(setSkillMode(original, 0, "any").anyOf[0].skillsAny, [
    "Python",
    "SQL",
    "React",
    "Go",
  ]);
});

test("availability exclusion is the existing boolean and preserves negative preferences on promotion", () => {
  const original = filters();
  original.anyOf[0].openToWork = true;
  const excluded = changeTokenState(
    original,
    { group: "anyOf", index: 0, key: "openToWork" },
    "exclude",
    0,
    "all",
  );
  assert.equal(excluded.anyOf[0].openToWork, false);
  assert.equal(
    tokenState(excluded, { group: "anyOf", index: 0, key: "openToWork" }),
    "exclude",
  );
  assert.equal(
    changeTokenState(
      excluded,
      { group: "anyOf", index: 0, key: "openToWork" },
      "required",
      0,
      "all",
    ).anyOf[0].openToWork,
    true,
  );
  original.preferred = [{ openToWork: false }];
  assert.equal(
    changeTokenState(
      original,
      { group: "preferred", index: 0, key: "openToWork" },
      "required",
      0,
      "all",
    ).anyOf[0].openToWork,
    false,
  );
});

test("numeric exclusion has no backing field and cannot silently invert the range", () => {
  const original = filters();
  const ref = { group: "anyOf" as const, index: 0, key: "minYears" as const };
  assert.equal(canExclude(ref), false);
  assert.equal(changeTokenState(original, ref, "exclude", 0, "all"), original);
  const next = changeTokenState(original, ref, "preferred", 0, "all");
  assert.equal(next.anyOf[0].minYears, undefined);
  assert.equal(next.anyOf[0].maxYears, 12);
  assert.deepEqual(next.preferred.at(-1), { minYears: 3 });
});

test("removing the last preference leaves no empty ranking criterion", () => {
  const original = filters();
  original.preferred = [{ skillsAny: ["React"] }];
  const next = removeEditorToken(original, {
    group: "preferred",
    index: 0,
    key: "skillsAny",
    valueIndex: 0,
  });
  assert.deepEqual(next.preferred, []);
  assert.deepEqual(next.anyOf, original.anyOf);
  assert.ok(validateSearchFilters(next));
});

test("multi-select deselection removes duplicate values without shifting other preference indices", () => {
  const original = filters();
  original.preferred = [
    { skillsAll: ["Python"] },
    { skillsAny: ["Python"] },
    { openToWork: true },
  ];
  const next = removeEditorTokens(original, [
    { group: "preferred", index: 0, key: "skillsAll", valueIndex: 0 },
    { group: "anyOf", index: 0, key: "skillsAll", valueIndex: 0 },
    { group: "preferred", index: 1, key: "skillsAny", valueIndex: 0 },
  ]);
  assert.deepEqual(next.anyOf[0].skillsAll, ["SQL"]);
  assert.deepEqual(next.preferred, [{ openToWork: true }]);
  assert.deepEqual(next.anyOf[1], original.anyOf[1]);
  assert.ok(validateSearchFilters(next));
});
