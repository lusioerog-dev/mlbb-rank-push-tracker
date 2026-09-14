import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { initialState } from "./seed";
import { startSeason } from "./seasons";
import { rehearseBackup, splitSeasons } from "./rehearsal";
import { readState, writeCompatibleState } from "./compatibility";

const account = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const at = "2026-09-14T12:00:00+00:00";
function fixture() {
  const original = { ...initialState(), revision: 0 };
  const next = {
    ...startSeason(original, {
      ...original.push,
      season: "Rehearsal next",
      startingStars: 1,
      startingRank: {
        tier: "Epic" as const,
        division: 2,
        rulesVersion: "mlbb-stars-2026-09" as const,
      },
    }),
    revision: 1,
  };
  const state = writeCompatibleState(next);
  return {
    workspaces: [
      { id: account, owner_id: owner, revision: 1, updated_at: at, state },
    ],
    members: [{ workspace_id: account, user_id: owner }],
    history: [original, next].map((s) => ({
      workspace_id: account,
      actor_id: owner,
      revision: s.revision,
      saved_at: at,
      state: writeCompatibleState(s),
    })),
  };
}

test("local restore and conversion preserve archived observations, history and an empty new season", async () => {
  const backup = fixture();
  const before = structuredClone(backup);
  const report = await rehearseBackup(backup);
  assert.deepEqual(backup, before);
  assert.equal(report.exactRestore, true);
  assert.equal(report.exactSeasonConversion, true);
  assert.equal(report.workspaces[0]!.archivedMatches, 4);
  assert.equal(report.workspaces[0]!.activeMatches, 0);
  assert.equal(report.workspaces[0]!.stars, 1);
  const missing = fixture();
  missing.history.shift();
  await assert.rejects(rehearseBackup(missing), /Incomplete history/);
});

test("additive v2 schema backfills stable season and match records without changing legacy rows", async () => {
  const backup = fixture();
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('${owner}');`);
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/202609130001_shared_tracker.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const [table, rows] of [
      ["tracker_workspaces", backup.workspaces],
      ["tracker_members", backup.members],
      ["tracker_history", backup.history],
    ] as const)
      await db.query(
        `insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},$1::jsonb)`,
        [JSON.stringify(rows)],
      );
    const legacyBefore = await db.query(
      "select to_jsonb(w) as row from public.tracker_workspaces w",
    );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/202609140002_tracker_v2.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec("set role service_role");
    const report = await db.query<{
      tracker_backfill_v2: {
        seasons: number;
        matches: number;
        revision: number;
      };
    }>("select public.tracker_backfill_v2($1)", [account]);
    assert.deepEqual(report.rows[0]!.tracker_backfill_v2, {
      workspaceId: account,
      revision: 1,
      seasons: 2,
      matches: 4,
    });
    const loaded = await db.query<{ tracker_load_v2: unknown }>(
      "select public.tracker_load_v2($1,$2)",
      [owner, account],
    );
    assert.deepEqual(
      readState(loaded.rows[0]!.tracker_load_v2),
      readState(backup.workspaces[0]!.state),
    );
    assert.deepEqual(
      (
        await db.query(
          "select to_jsonb(w) as row from public.tracker_workspaces w",
        )
      ).rows,
      legacyBefore.rows,
    );
    const seasonIds = (
      await db.query<{ id: string }>(
        "select id from public.tracker_seasons order by id",
      )
    ).rows.map((r) => r.id);
    assert.deepEqual(seasonIds, [
      `${account}:season-after:${backup.workspaces[0]!.state.audit.at(-1)!.id}`,
      `${account}:season-before:${backup.workspaces[0]!.state.audit.at(-1)!.id}`,
    ]);
    await assert.rejects(
      db.query("select public.tracker_backfill_v2($1)", [account]),
      /ALREADY_BACKFILLED/,
    );
    await assert.rejects(
      db.query("select public.tracker_load_v2($1,$2)", [
        "33333333-3333-4333-8333-333333333333",
        account,
      ]),
      /FORBIDDEN/,
    );
    await db.exec("reset role; set role authenticated");
    await assert.rejects(
      db.query("select * from public.tracker_seasons"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("migration refuses a malformed archive instead of silently losing it", () => {
  const state = initialState();
  state.audit.push({
    id: "bad-archive",
    at: new Date().toISOString(),
    action: "settings",
    note: "Fixture",
    before: { seasonArchive: { push: state.push, matches: state.matches } },
  });
  assert.throws(() => splitSeasons(account, state));
});
