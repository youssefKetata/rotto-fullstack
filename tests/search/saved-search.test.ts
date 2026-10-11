import assert from "node:assert/strict";
import test from "node:test";
import { savedSearchKey } from "../../src/lib/search/saved-search";
import type { SearchFilters } from "../../src/lib/search/schema";

test("restored searches match saved copies regardless of JSON property order", () => {
  const filters: SearchFilters = {
    version: 1,
    anyOf: [{ skillsAll: ["React"], minYears: 2 }],
    preferred: [],
    issues: [],
  };
  const original = savedSearchKey({ brief: "React developers", filters });
  assert.equal(
    original,
    savedSearchKey({
      brief: " React developers ",
      filters: {
        issues: [],
        preferred: [],
        anyOf: [{ minYears: 2, skillsAll: ["React"] }],
        version: 1,
      },
    }),
  );
  assert.notEqual(
    original,
    savedSearchKey({
      brief: "React developers",
      filters: { ...filters, anyOf: [{ skillsAll: ["React"], minYears: 3 }] },
    }),
  );
  assert.notEqual(original, savedSearchKey({ brief: "Other brief", filters }));
});
