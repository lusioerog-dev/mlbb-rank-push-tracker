import assert from "node:assert/strict";
import { test } from "node:test";
import { initialState } from "./seed";
import { archivedSeasons, startSeason } from "./seasons";
import { readState, writeCompatibleState } from "./compatibility";
import { currentRank } from "./model";
import { RANK_RULES } from "./rank-rules";

test("season reset preserves records and corrections through compatible backups", () => {
  const original = initialState();
  const before = structuredClone(original);
  const next = startSeason(original, {
    ...original.push,
    season: "Next season",
    startingStars: 2,
    startingRank: {
      tier: "Epic",
      division: 2,
      rulesVersion: RANK_RULES.version,
    },
  });
  assert.deepEqual(original, before);
  assert.equal(next.matches.length, 0);
  assert.equal(currentRank(next).rankStars, 2);
  assert.equal(next.revision, original.revision);
  assert.deepEqual(next.audit.slice(0, -1), original.audit);
  const restored = readState(
    JSON.parse(JSON.stringify(writeCompatibleState(next))),
  );
  const archived = archivedSeasons(restored)[0]!.state;
  assert.deepEqual(archived.matches, original.matches);
  assert.deepEqual(archived.heroes, original.heroes);
  assert.deepEqual(archived.players, original.players);
  assert.deepEqual(archived.push, original.push);
  const third = startSeason(restored, {
    ...restored.push,
    season: "Another season",
  });
  assert.equal(archivedSeasons(third).length, 2);
  assert.deepEqual(archivedSeasons(third)[0]!.state, archived);
  assert.equal(archivedSeasons(third)[1]!.state.audit.length, 0);
});

test("new season requires a distinct name and valid confirmed baseline", () => {
  const state = initialState();
  assert.throws(() => startSeason(state, state.push), /distinct/);
  assert.throws(
    () => startSeason(state, { ...state.push, season: " " }),
    /distinct/,
  );
  assert.throws(
    () =>
      startSeason(state, {
        ...state.push,
        season: "Next",
        startingRank: undefined,
      }),
    /starting rank/,
  );
  assert.throws(() =>
    startSeason(state, {
      ...state.push,
      season: "Next",
      startingStars: 100,
      startingRank: {
        tier: "Epic",
        division: 2,
        rulesVersion: RANK_RULES.version,
      },
    }),
  );
});
