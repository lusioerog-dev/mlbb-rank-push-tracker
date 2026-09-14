import assert from "node:assert/strict";
import { test } from "node:test";
import { playerName } from "./players";
import { readState } from "./compatibility";
import { initialState } from "./seed";
import { exportCsv } from "./storage";

test("fixed display names preserve historical stored names and attribution", () => {
  const original = initialState();
  original.players[1]!.name = "Old editable name";
  const loaded = readState({ ...original, version: 1, dataset: "real" });
  assert.equal(loaded.players[1]!.name, "Old editable name");
  assert.equal(playerName(loaded.matches[0]!.playerId), "Gaurav");
  assert.equal(playerName("rupesh"), "Rupesh");
  assert.equal(playerName("unrecognized"), "Unmapped player");
  assert.ok(!exportCsv(loaded).includes("Old editable name"));
  assert.throws(() =>
    readState({
      ...original,
      players: [...original.players, { id: "third", name: "Someone" }],
    }),
  );
  assert.throws(() =>
    readState({ ...original, players: [original.players[0]] }),
  );
});
