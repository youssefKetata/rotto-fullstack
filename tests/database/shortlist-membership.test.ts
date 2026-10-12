import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ApiError } from "../../src/lib/api";
import { getDatabase } from "../../src/lib/database";
import { mutateShortlistMembership } from "../../src/lib/search/shortlist-membership";
import { withSearchFixture } from "./search-fixture";

test("shortlist removal, Undo and concurrent membership preserve company boundaries", async (t) => {
  t.after(() => getDatabase().end({ timeout: 5 }));
  await withSearchFixture(async (owner) => {
    await withSearchFixture(async (other) => {
      const listId = randomUUID();
      const [person] = await owner.sql<
        { id: string }[]
      >`select id from public.candidates order by id limit 1`;
      assert.ok(person);
      await owner.sql`insert into public.shortlists(id, company_id, created_by, name) values (${listId}, ${owner.companyId}, ${owner.userId}, 'Undo test')`;
      const originalTime = "2025-04-01T12:34:56.123456Z";
      try {
        await t.test(
          "immediate delete and repeated Undo preserve the original timestamp",
          async () => {
            await mutateShortlistMembership(
              owner.userId,
              listId,
              person.id,
              true,
              originalTime,
            );
            const removed = await mutateShortlistMembership(
              owner.userId,
              listId,
              person.id,
              false,
            );
            assert.ok("membership" in removed && removed.membership);
            assert.equal(removed.membership.added_at, originalTime);
            const [count] =
              await owner.sql`select count(*)::int as total from public.shortlist_people where shortlist_id = ${listId}`;
            assert.equal(count.total, 0);
            await Promise.all(
              Array.from({ length: 8 }, () =>
                mutateShortlistMembership(
                  owner.userId,
                  listId,
                  person.id,
                  true,
                  removed.membership!.added_at,
                ),
              ),
            );
            const rows =
              await owner.sql`select to_char(added_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as added_at from public.shortlist_people where shortlist_id = ${listId}`;
            assert.equal(rows.length, 1);
            assert.equal(rows[0].added_at, originalTime);
          },
        );
        await t.test(
          "a re-add wins over a stale Undo without changing its timestamp",
          async () => {
            await mutateShortlistMembership(
              owner.userId,
              listId,
              person.id,
              false,
            );
            const readdedTime = "2025-05-02T09:00:00.654321Z";
            await mutateShortlistMembership(
              owner.userId,
              listId,
              person.id,
              true,
              readdedTime,
            );
            await mutateShortlistMembership(
              owner.userId,
              listId,
              person.id,
              true,
              originalTime,
            );
            const removed = await mutateShortlistMembership(
              owner.userId,
              listId,
              person.id,
              false,
            );
            assert.ok("membership" in removed && removed.membership);
            assert.equal(removed.membership.added_at, readdedTime);
            const repeated = await mutateShortlistMembership(
              owner.userId,
              listId,
              person.id,
              false,
            );
            assert.ok("membership" in repeated);
            assert.equal(repeated.membership, null);
          },
        );
        await t.test(
          "foreign company additions, removals and Undo are rejected",
          async () => {
            for (const add of [true, false]) {
              await assert.rejects(
                mutateShortlistMembership(
                  other.userId,
                  listId,
                  person.id,
                  add,
                  originalTime,
                ),
                (error) => error instanceof ApiError && error.status === 404,
              );
            }
            await assert.rejects(
              mutateShortlistMembership(
                owner.userId,
                randomUUID(),
                person.id,
                true,
                originalTime,
              ),
              (error) => error instanceof ApiError && error.status === 404,
            );
          },
        );
      } finally {
        await owner.sql`delete from public.shortlists where id = ${listId}`;
      }
    });
  });
});
