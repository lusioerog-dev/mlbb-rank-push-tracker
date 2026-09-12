import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentRank,
  heroStats,
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
  const real = stateSchema.parse(initialState("real"));
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
  const demo = initialState("demo");
  assert.equal(starChange(demo.matches[3]!), 0);
  assert.equal(stats(demo.matches).net, 0);
  const unknown = { ...demo.matches[0]!, starsAfter: null };
  assert.equal(starChange(unknown), null);
  assert.equal(stats([unknown]).net, null);
  assert.equal(stats([]).winRate, null);
  assert.equal(stats([{ ...unknown, result: "unknown" }]).winRate, null);
});
test("out-of-order imports do not overwrite latest rank; later unknown star state is visible", () => {
  const state = initialState("real");
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
  const state = initialState("real");
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
test("runtime validation rejects malformed imports and broken references", () => {
  const state = initialState("real");
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
  assert.throws(() => stateSchema.parse({ ...state, version: 2 }));
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
test("real/demo storage and imports stay isolated; backups roundtrip and stale writes fail", () => {
  const storage = memory();
  const real = persistState(storage, initialState("real"), 0);
  persistState(storage, initialState("demo"), 0);
  assert.equal(loadState(storage, "real").matches.length, 4);
  assert.equal(loadState(storage, "demo").matches.length, 7);
  assert.deepEqual(parseBackup(JSON.stringify(real), "real"), real);
  assert.throws(
    () => parseBackup(JSON.stringify(initialState("demo")), "real"),
    /matching/,
  );
  assert.throws(() => persistState(storage, real, 0), /Another tab/);
  storage.setItem(storageKey("real"), "corrupt");
  assert.throws(() => loadState(storage, "real"));
  assert.equal(storage.getItem(storageKey("real")), "corrupt");
});
test("storage write failures surface instead of claiming success", () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("Quota exceeded");
    },
  };
  assert.throws(() => persistState(storage, initialState("real"), 0), /Quota/);
});
test("hero statistics remain per-player and CSV escapes spreadsheet formulas", () => {
  const state = initialState("real");
  state.heroes.push({ id: "hero1", name: "Confirmed hero" });
  state.matches[0] = { ...state.matches[0]!, heroId: "hero1" };
  state.players[1]!.name = '=HYPERLINK("example")';
  assert.equal(heroStats(state, state.matches)[0]!.games, 1);
  assert.match(exportCsv(state), /'=HYPERLINK\(""example""\)/);
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
