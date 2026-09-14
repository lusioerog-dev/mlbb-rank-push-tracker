import assert from "node:assert/strict";
import { test } from "node:test";
import { initialState } from "./seed";
import { startSeason } from "./seasons";
import { rehearseBackup, splitSeasons } from "./rehearsal";
import { writeCompatibleState } from "./compatibility";

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
