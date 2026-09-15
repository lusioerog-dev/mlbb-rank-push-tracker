import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentRank,
  heroPerformance,
  heroStats,
  positionPerformance,
  recordHeroObservation,
  saveMatch,
  starChange,
  stateSchema,
  stats,
} from "./model";
import { initialState } from "./seed";
import {
  exportCsv,
  loadState,
  parseBackup,
  persistState,
  storageKey,
} from "./storage";
import { localInput, toInstant } from "./time";
const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  };
};

test("real screenshot seed has one shared account and only confirmed Gaurav matches", () => {
  const real = stateSchema.parse(initialState());
  assert.equal(currentRank(real).stars, 117);
  assert.equal(stats(real.matches).net, 2);
  assert.equal(stats(real.matches).winRate, 75);
  assert.equal(stats(real.matches).seconds, 3003);
  assert.equal(
    real.matches.every((m) => m.playerId === "gaurav"),
    true,
  );
  const next = saveMatch(real, {
    ...real.matches[0]!,
    id: "rupesh-next",
    playerId: "rupesh",
    playedAt: "2026-09-12T20:00:00+05:45",
    result: "win",
    starsBefore: 117,
    starsAfter: 118,
  });
  assert.equal(currentRank(next).stars, 118);
  assert.equal(
    stats(next.matches.filter((m) => m.playerId === "rupesh")).net,
    1,
  );
});
test("zero-change loss is not minus one; unknown changes are not zero", () => {
  const protectedLoss = { ...initialState().matches[0]!, starsAfter: 115 };
  assert.equal(starChange(protectedLoss), 0);
  assert.equal(stats([protectedLoss]).net, 0);
  const unknown = { ...protectedLoss, starsAfter: null };
  assert.equal(starChange(unknown), null);
  assert.equal(stats([unknown]).net, null);
  assert.equal(stats([]).winRate, null);
  assert.equal(stats([{ ...unknown, result: "unknown" }]).winRate, null);
});
test("out-of-order imports do not overwrite latest rank; later unknown star state is visible", () => {
  const state = initialState();
  state.matches.reverse();
  assert.equal(currentRank(state).stars, 117);
  state.matches.push({
    ...state.matches[0]!,
    id: "unknown",
    playedAt: "2026-09-13T00:00:00Z",
    starsAfter: null,
  });
  assert.equal(currentRank(state).stars, 117);
  assert.equal(currentRank(state).incomplete, true);
});
test("corrections preserve originals and creation provenance; duplicate match times rejected", () => {
  const state = initialState();
  const old = state.matches[0]!;
  assert.throws(() => saveMatch(state, { ...old, kills: 4 }), /correction/);
  const next = saveMatch(
    state,
    { ...old, kills: 4, source: "manual", createdAt: "2026-09-13T00:00:00Z" },
    "Correct screenshot reading",
  );
  assert.equal(next.matches[0]!.kills, 4);
  assert.equal(next.matches[0]!.source, "screenshot_review");
  assert.equal(next.matches[0]!.createdAt, old.createdAt);
  assert.equal(next.audit[0]!.before.kills, 3);
  assert.equal(state.matches[0]!.kills, 3);
  assert.throws(
    () => saveMatch(state, { ...old, id: "duplicate" }),
    /already recorded/,
  );
});
test("battle, hero and played-position identity preserve exact observations", () => {
  const state = initialState();
  const first = recordHeroObservation(
    state,
    "Benedetta",
    "000000421",
    "hero-benedetta",
  );
  const aliased = recordHeroObservation(
    first.state,
    "Bene",
    "000000421",
    "unused-id",
  );
  assert.equal(aliased.heroId, "hero-benedetta");
  assert.deepEqual(aliased.state.heroes[0], {
    id: "hero-benedetta",
    name: "Benedetta",
    gameId: "000000421",
    aliases: ["Bene"],
  });
  const saved = saveMatch(aliased.state, {
    ...aliased.state.matches[0]!,
    id: "identified-match",
    battleId: "0000123456789012345",
    heroId: aliased.heroId,
    heroObservation: aliased.observation,
    playedPosition: "exp_lane",
    playedAt: "2026-09-13T01:00:00Z",
  });
  assert.equal(saved.matches.at(-1)!.battleId, "0000123456789012345");
  assert.equal(saved.matches.at(-1)!.playedPosition, "exp_lane");
  assert.deepEqual(saved.matches.at(-1)!.heroObservation, {
    name: "Bene",
    gameId: "000000421",
  });
  assert.throws(
    () =>
      saveMatch(saved, {
        ...saved.matches.at(-1)!,
        id: "duplicate-battle",
        playedAt: "2026-09-13T02:00:00Z",
      }),
    /Battle ID/,
  );
  assert.deepEqual(recordHeroObservation(state, "", ""), {
    state,
    heroId: null,
    observation: null,
  });
});
test("runtime validation rejects malformed imports and broken references", () => {
  const state = initialState();
  assert.throws(
    () =>
      saveMatch(
        state,
        { ...state.matches[0]!, playedAt: state.matches[1]!.playedAt },
        "Duplicate timestamp",
      ),
    /already recorded/,
  );
  assert.throws(() =>
    stateSchema.parse({
      ...state,
      matches: [...state.matches, { ...state.matches[0], id: "different-id" }],
    }),
  );
  assert.throws(() =>
    stateSchema.parse({
      ...state,
      push: { ...state.push, rankTier: "Tier A" },
      matches: [{ ...state.matches[0], rankTier: "Tier B" }],
    }),
  );
  assert.throws(() => stateSchema.parse({ ...state, version: 3 }));
  assert.throws(() =>
    stateSchema.parse({
      ...state,
      matches: [{ ...state.matches[0], playerId: "missing" }],
    }),
  );
  assert.throws(() =>
    stateSchema.parse({
      ...state,
      matches: [{ ...state.matches[0], kills: -1 }],
    }),
  );
  assert.throws(() =>
    stateSchema.parse({
      ...state,
      matches: [{ ...state.matches[0], mode: "classic" }],
    }),
  );
  assert.throws(() =>
    stateSchema.parse({
      ...state,
      players: [...state.players, state.players[0]],
    }),
  );
});
test("backups roundtrip and stale writes fail without overwriting unreadable data", () => {
  const storage = memory();
  const saved = persistState(storage, initialState(), 0);
  assert.equal(loadState(storage).matches.length, 4);
  assert.deepEqual(parseBackup(JSON.stringify(saved)), saved);
  assert.throws(() => persistState(storage, saved, 0), /Another tab/);
  storage.setItem(storageKey, "corrupt");
  assert.throws(() => loadState(storage));
  assert.equal(storage.getItem(storageKey), "corrupt");
});
test("storage write failures surface instead of claiming success", () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("Quota exceeded");
    },
  };
  assert.throws(() => persistState(storage, initialState(), 0), /Quota/);
});
test("hero statistics remain per-player and CSV escapes spreadsheet formulas", () => {
  const state = initialState();
  state.heroes.push({ id: "hero1", name: "Confirmed hero" });
  state.matches[0] = { ...state.matches[0]!, heroId: "hero1" };
  state.heroes[0]!.name = '=HYPERLINK("example")';
  assert.equal(heroStats(state, state.matches)[0]!.games, 1);
  assert.match(exportCsv(state), /'=HYPERLINK\(""example""\)/);
});
test("hero and position performance aggregate the selected matches and sort by games then win rate", () => {
  const state = initialState();
  state.heroes = [
    { id: "bene", name: "Benedetta" },
    { id: "miya", name: "Miya" },
  ];
  state.matches = state.matches.map((match, index) => ({
    ...match,
    heroId: index < 2 ? "bene" : "miya",
    playedPosition: index < 2 ? "jungle" : "gold_lane",
    result: index === 0 ? "loss" : "win",
  }));
  assert.deepEqual(
    heroPerformance(state, state.matches).map((row) => [
      row.hero.name,
      row.games,
      row.winRate,
    ]),
    [
      ["Miya", 2, 100],
      ["Benedetta", 2, 50],
    ],
  );
  assert.deepEqual(
    positionPerformance(state.matches).map((row) => [row.position, row.games]),
    [
      ["gold_lane", 2],
      ["jungle", 2],
    ],
  );
  assert.equal(heroPerformance(state, state.matches)[0]!.averageKda, 40 / 3);
});
test("Nepal match time conversion and date grouping are explicit", () => {
  assert.equal(
    toInstant("2026-09-12T19:11", "Asia/Kathmandu"),
    "2026-09-12T13:26:00.000Z",
  );
  assert.equal(
    localInput("2026-09-12T19:00:00Z", "Asia/Kathmandu"),
    "2026-09-13T00:45",
  );
  assert.throws(
    () => toInstant("2026-03-08T02:30", "America/New_York"),
    /does not exist/,
  );
  assert.throws(
    () => toInstant("2026-11-01T01:30", "America/New_York"),
    /repeats/,
  );
});
