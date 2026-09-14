import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  readState,
  writeCompatibleState,
} from "../packages/tracker/compatibility";
import { backupSchema, rehearseBackup } from "../packages/tracker/rehearsal";
import { currentRank, stats } from "../packages/tracker/model";
import { startSeason } from "../packages/tracker/seasons";

const path = process.argv[2];
const expectedMd5 = process.argv[3];
if (!path || !expectedMd5)
  throw new Error(
    "Usage: npx tsx scripts/v2-rehearsal.ts <backup.json> <PostgreSQL-MD5>",
  );
const backup = backupSchema.parse(JSON.parse(await readFile(path, "utf8")));
assert.equal(
  (await rehearseBackup(backup)).postgresJsonMd5,
  expectedMd5,
  "Source checksum mismatch",
);
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);`);
  const users = new Set([
    ...backup.members.map((m) => m.user_id),
    ...backup.workspaces.map((w) => w.owner_id),
    ...backup.history.map((h) => h.actor_id),
  ]);
  for (const user of users)
    await db.query("insert into auth.users values ($1)", [user]);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609130001_shared_tracker.sql",
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
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609140002_tracker_v2.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609140003_tracker_v2_writes.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec("set role service_role");
  const results = [];
  for (const workspace of backup.workspaces) {
    const backfill = (
      await db.query<{ tracker_backfill_v2: unknown }>(
        "select public.tracker_backfill_v2($1)",
        [workspace.id],
      )
    ).rows[0]!.tracker_backfill_v2;
    const loaded = (
      await db.query<{ tracker_load_v2: unknown }>(
        "select public.tracker_load_v2($1,$2)",
        [workspace.owner_id, workspace.id],
      )
    ).rows[0]!.tracker_load_v2;
    const original = readState(workspace.state),
      restored = readState(loaded);
    assert.deepEqual(
      restored,
      original,
      "Version 2 read changed current state",
    );
    assert.deepEqual(currentRank(restored), currentRank(original));
    assert.deepEqual(stats(restored.matches), stats(original.matches));
    const saved = readState(
      (
        await db.query<{ tracker_save_v2: unknown }>(
          "select public.tracker_save_v2($1,$2,$3,$4::jsonb)",
          [
            workspace.owner_id,
            workspace.id,
            original.revision,
            JSON.stringify(original),
          ],
        )
      ).rows[0]!.tracker_save_v2,
    );
    await assert.rejects(
      db.query("select public.tracker_save_v2($1,$2,$3,$4::jsonb)", [
        workspace.owner_id,
        workspace.id,
        original.revision,
        JSON.stringify(original),
      ]),
      /CONFLICT/,
    );
    const adapted = readState(
      (
        await db.query<{ tracker_save: unknown }>(
          "select public.tracker_save($1,$2,$3,$4::jsonb)",
          [
            workspace.owner_id,
            workspace.id,
            saved.revision,
            JSON.stringify(writeCompatibleState(saved)),
          ],
        )
      ).rows[0]!.tracker_save,
    );
    const rehearsalSeason = startSeason(adapted, {
      ...adapted.push,
      season: "LOCAL ROLLOVER REHEARSAL",
    });
    const rolled = readState(
      (
        await db.query<{ tracker_save_v2: unknown }>(
          "select public.tracker_save_v2($1,$2,$3,$4::jsonb)",
          [
            workspace.owner_id,
            workspace.id,
            adapted.revision,
            JSON.stringify(rehearsalSeason),
          ],
        )
      ).rows[0]!.tracker_save_v2,
    );
    const rolloverCounts = (
      await db.query<{ active: number; archived: number; matches: number }>(
        "select count(*) filter(where status='active')::int active, count(*) filter(where status='archived')::int archived, (select count(*)::int from public.tracker_matches) matches from public.tracker_seasons",
      )
    ).rows[0]!;
    assert.equal(rolled.matches.length, 0);
    assert.equal(rolloverCounts.matches, original.matches.length);
    results.push({
      backfill,
      rank: currentRank(restored),
      stats: stats(restored.matches),
      normalSaveRevision: saved.revision,
      legacyAdapterRevision: adapted.revision,
      rolloverRevision: rolled.revision,
      rolloverCounts,
    });
  }
  console.log(
    JSON.stringify(
      { sourceChecksumVerified: true, legacyRowsChanged: false, results },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
