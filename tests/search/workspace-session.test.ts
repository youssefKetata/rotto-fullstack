import assert from "node:assert/strict";
import test from "node:test";
import {
  readWorkspaceSession,
  workspaceEntry,
  type WorkspaceSession,
} from "../../src/components/search/workspace-session";

const identity = "company-a:recruiter-a";
const saved: WorkspaceSession = {
  draft: "An edited brief",
  activeSearchId: "previous-search",
  lastSearchId: "previous-search",
};
const entry = (path: string, session = saved) =>
  workspaceEntry(
    new URL(path, "https://rotto.test"),
    session,
    undefined,
    identity,
  );

test("sign-in starts empty even with a saved search or unfinished draft", () => {
  assert.deepEqual(entry("/?new=1"), { searchId: null, draft: "" });
  assert.deepEqual(entry("/?new=1", { ...saved, activeSearchId: null }), {
    searchId: null,
    draft: "",
  });
});

test("opening home never silently restores the previous search or its brief", () => {
  assert.deepEqual(entry("/"), { searchId: null, draft: undefined });
});

test("refresh preserves both result edits and a new-search draft", () => {
  assert.deepEqual(entry("/?search=previous-search"), {
    searchId: "previous-search",
    draft: "An edited brief",
  });
  assert.deepEqual(entry("/", { ...saved, activeSearchId: null }), {
    searchId: null,
    draft: "An edited brief",
  });
});

test("an explicit search URL takes precedence and never adopts another search's draft", () => {
  assert.deepEqual(entry("/?search=shared-search&new=1"), {
    searchId: "shared-search",
    draft: undefined,
  });
});

test("Back restores the history entry's own draft after visiting another search", () => {
  assert.deepEqual(
    workspaceEntry(
      new URL("https://rotto.test/"),
      saved,
      { identity, searchId: null, draft: "My unfinished new search" },
      identity,
    ),
    { searchId: null, draft: "My unfinished new search" },
  );
});

test("history drafts do not cross recruiter identities or search URLs", () => {
  const url = new URL("https://rotto.test/?search=shared-search");
  for (const history of [
    {
      identity: "other-recruiter",
      searchId: "shared-search",
      draft: "Private",
    },
    { identity, searchId: "another-search", draft: "Wrong search" },
  ]) {
    assert.deepEqual(workspaceEntry(url, saved, history, identity), {
      searchId: "shared-search",
      draft: undefined,
    });
  }
});

test("legacy sessions retain their resume option and malformed storage is optional", () => {
  assert.deepEqual(
    readWorkspaceSession(
      JSON.stringify({ draft: saved.draft, lastSearchId: saved.lastSearchId }),
    ),
    saved,
  );
  assert.deepEqual(readWorkspaceSession("bad JSON"), {
    draft: "",
    activeSearchId: null,
    lastSearchId: null,
  });
  assert.equal(
    readWorkspaceSession(JSON.stringify({ draft: "a".repeat(5000) })).draft
      .length,
    4000,
  );
});
