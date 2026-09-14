import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { z } from "zod";
import { readState } from "./compatibility";
import { currentRank, stateSchema, stats, type TrackerState } from "./model";

const uuid = z.string().uuid();
const revision = z.number().int().nonnegative();
export const backupSchema = z
  .object({
    workspaces: z
      .array(
        z
          .object({
            id: uuid,
            owner_id: uuid,
            state: z.unknown(),
            revision,
            updated_at: z.string(),
          })
          .strict(),
      )
      .min(1),
    members: z.array(z.object({ workspace_id: uuid, user_id: uuid }).strict()),
    history: z.array(
      z
        .object({
          workspace_id: uuid,
          revision,
          actor_id: uuid,
          state: z.unknown(),
          saved_at: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export function splitSeasons(accountId: string, state: TrackerState) {
  const seasons: Array<{
    id: string;
    status: "active" | "archived";
    source: string;
    state: TrackerState;
  }> = [];
  for (const entry of state.audit) {
    if (!("seasonArchive" in entry.before)) continue;
    // Fail loudly on malformed archives; the launch reader skips invalid entries.
    const archive = z
      .object({
        push: z.unknown(),
        players: z.unknown(),
        heroes: z.unknown(),
        matches: z.unknown(),
      })
      .strict()
      .parse(entry.before.seasonArchive);
    seasons.push({
      id: `${accountId}:archive:${entry.id}`,
      status: "archived",
      source: entry.id,
      state: stateSchema.parse({
        ...archive,
        format: state.format,
        version: 2,
        revision: 0,
        audit: [],
      }),
    });
  }
  const lastArchive = seasons.at(-1)?.source ?? "initial";
  seasons.push({
    id: `${accountId}:active-after:${lastArchive}`,
    status: "active",
    source: "current",
    state,
  });
  assert.equal(
    new Set(seasons.map((s) => s.id)).size,
    seasons.length,
    "Duplicate archive identity",
  );
  return seasons;
}

// Local-only rehearsal. A database URL is deliberately not accepted.
export async function rehearseBackup(input: unknown) {
  const backup = backupSchema.parse(input);
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
          "../../supabase/migrations/202609130001_shared_tracker.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    // JSON recordsets retain PostgreSQL timestamp precision and original JSON.
    for (const [table, rows] of [
      ["tracker_workspaces", backup.workspaces],
      ["tracker_members", backup.members],
      ["tracker_history", backup.history],
    ] as const) {
      await db.query(
        `insert into public.${table} select * from jsonb_populate_recordset(null::public.${table}, $1::jsonb)`,
        [JSON.stringify(rows)],
      );
      const restored = await db.query<{ record: unknown }>(
        `select to_jsonb(t) as record from public.${table} t`,
      );
      // Compare typed SQL rows so equivalent timestamp offset spellings match,
      // retaining microseconds. JSON payloads still compare in their entirety.
      for (const original of rows) {
        const equal = await db.query<{ count: number }>(
          `select count(*)::int as count from public.${table} t where to_jsonb(t)=to_jsonb(jsonb_populate_record(null::public.${table}, $1::jsonb))`,
          [JSON.stringify(original)],
        );
        assert.equal(equal.rows[0]!.count, 1, `Changed row in ${table}`);
      }
      assert.equal(restored.rows.length, rows.length);
    }
    const checksum = (
      await db.query<{ md5: string }>("select md5($1::jsonb::text) as md5", [
        JSON.stringify(backup),
      ])
    ).rows[0]!.md5;
    await db.exec(`create schema rehearsal;
      create table rehearsal.seasons(id text primary key, account_id uuid not null, status text not null, metadata jsonb not null);
      create unique index one_active_season on rehearsal.seasons(account_id) where status='active';
      create table rehearsal.matches(season_id text references rehearsal.seasons(id), id text not null, ordinal integer not null, record jsonb not null, primary key(season_id,id), unique(season_id,ordinal));`);
    const reports = [];
    for (const workspace of backup.workspaces) {
      const state = readState(workspace.state);
      assert.equal(
        state.revision,
        workspace.revision,
        "Snapshot revision mismatch",
      );
      const history = backup.history
        .filter((h) => h.workspace_id === workspace.id)
        .sort((a, b) => a.revision - b.revision);
      assert.deepEqual(
        history.map((h) => h.revision),
        Array.from({ length: workspace.revision + 1 }, (_, i) => i),
        "Incomplete history",
      );
      assert.deepEqual(
        history.at(-1)!.state,
        workspace.state,
        "Latest history does not match current state",
      );
      for (const h of history) {
        assert.equal(readState(h.state).revision, h.revision);
        splitSeasons(workspace.id, readState(h.state));
      }
      const seasons = splitSeasons(workspace.id, state);
      assert.deepEqual(
        splitSeasons(workspace.id, state),
        seasons,
        "Mapping must be repeatable",
      );
      for (const season of seasons) {
        const { matches, ...metadata } = season.state;
        await db.query(
          "insert into rehearsal.seasons values ($1,$2,$3,$4::jsonb)",
          [season.id, workspace.id, season.status, JSON.stringify(metadata)],
        );
        for (const [ordinal, match] of matches.entries())
          await db.query(
            "insert into rehearsal.matches values ($1,$2,$3,$4::jsonb)",
            [season.id, match.id, ordinal, JSON.stringify(match)],
          );
        const records = (
          await db.query<{ record: unknown }>(
            "select record from rehearsal.matches where season_id=$1 order by ordinal",
            [season.id],
          )
        ).rows;
        const savedMetadata = (
          await db.query<{ metadata: object }>(
            "select metadata from rehearsal.seasons where id=$1",
            [season.id],
          )
        ).rows[0]!.metadata;
        const restored = stateSchema.parse({
          ...savedMetadata,
          matches: records.map((r) => r.record),
        });
        assert.deepEqual(
          restored,
          season.state,
          "Season conversion changed data",
        );
        assert.deepEqual(currentRank(restored), currentRank(season.state));
        assert.deepEqual(stats(restored.matches), stats(season.state.matches));
      }
      reports.push({
        revision: workspace.revision,
        activeMatches: state.matches.length,
        archivedSeasons: seasons.length - 1,
        archivedMatches: seasons
          .filter((s) => s.status === "archived")
          .reduce((n, s) => n + s.state.matches.length, 0),
        historySnapshots: history.length,
        rank: currentRank(state).tier,
        stars: currentRank(state).rankStars,
      });
    }
    return {
      postgresJsonMd5: checksum,
      members: backup.members.length,
      workspaces: reports,
      exactRestore: true,
      exactSeasonConversion: true,
    };
  } finally {
    await db.close();
  }
}

export const fileSha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
