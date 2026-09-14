import assert from "node:assert/strict";
import { test } from "node:test";
import { readState, writeCompatibleState } from "./compatibility";
import { initialState } from "./seed";
import { loadState, parseBackup, persistState, storageKey } from "./storage";

test("legacy real snapshots preserve IDs, observations, attribution and correction history", () => {
  const expected = initialState();
  expected.revision = 17;
  expected.heroes = [{ id: "historical-hero", name: "Benedetta" }];
  expected.matches[0]!.heroId = "historical-hero";
  expected.matches[0]!.starDelta = null;
  expected.audit.push({
    id: "original-correction",
    at: "2026-09-13T00:00:00Z",
    action: "settings",
    note: "Historical settings",
    before: { push: expected.push, players: expected.players, dataset: "real" },
  });
  const legacy = { ...expected, version: 1, dataset: "real" };
  const original = JSON.stringify(legacy);
  assert.deepEqual(readState(legacy), expected);
  assert.deepEqual(parseBackup(original), expected);
  assert.equal(JSON.stringify(legacy), original);
  assert.deepEqual(writeCompatibleState(expected), legacy);
  assert.ok(!("dataset" in readState(legacy)));
});

test("legacy demo and malformed snapshots are rejected, never relabeled or reset", () => {
  for (const value of [
    { ...initialState(), version: 1, dataset: "demo" },
    { ...initialState(), version: 1 },
    { ...initialState(), dataset: "demo" },
    { ...initialState(), version: 3 },
    { ...initialState(), version: 1, dataset: "real", unexpected: true },
    {
      ...initialState(),
      version: 1,
      dataset: "real",
      matches: [{ id: "broken" }],
    },
  ]) {
    assert.throws(() => readState(value));
    assert.throws(() => parseBackup(JSON.stringify(value)));
  }
});

test("existing browser data loads without a write; saves preserve the deployed format and revision guard", () => {
  const legacy = {
    ...initialState(),
    version: 1,
    dataset: "real",
    revision: 9,
  };
  const values = new Map([
    ["mlbb-manual-v1-real", JSON.stringify(legacy)],
    ["mlbb-manual-v1-demo", "untouched"],
  ]);
  let writes = 0;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes++;
      values.set(key, value);
    },
  };
  const loaded = loadState(storage);
  assert.equal(writes, 0);
  assert.equal(loaded.revision, 9);
  const saved = persistState(storage, loaded, 9);
  assert.equal(saved.version, 2);
  assert.equal(saved.revision, 10);
  assert.deepEqual(JSON.parse(values.get(storageKey)!), {
    ...legacy,
    revision: 10,
  });
  assert.throws(() => persistState(storage, loaded, 9), /Another tab/);
  assert.equal(writes, 1);
  assert.equal(values.get("mlbb-manual-v1-demo"), "untouched");
});
