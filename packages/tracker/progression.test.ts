import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountProgression,
  currentRank,
  dailyProgression,
  deleteMatch,
  formatPlaytime,
  playerContributions,
  rankTargetProgress,
  saveMatch,
  stateSchema,
  stats,
} from "./model";
import type { Match, TrackerState } from "./model";
import { initialState } from "./seed";
import {
  RANK_RULES,
  advanceRank,
  getRankDisplay,
  getSeasonResetSuggestion,
  rankLabel,
} from "./rank-rules";
import { parseBackup } from "./storage";
const state = (stars = 115): TrackerState => ({
  ...initialState(),
  matches: [],
  push: {
    ...initialState().push,
    startingStars: stars,
    startingRank: {
      tier: "Mythic",
      division: null,
      rulesVersion: RANK_RULES.version,
    },
  },
});
const match = (
  id: string,
  delta: number | null,
  playerId = "rupesh",
  playedAt = `2026-09-13T${id.padStart(2, "0")}:00:00Z`,
): Match => ({
  ...initialState().matches[0]!,
  id,
  playerId,
  playedAt,
  starsBefore: null,
  starsAfter: null,
  starDelta: delta,
  result: delta !== null && delta < 0 ? "loss" : "win",
});
test("normal win and loss derive 115 ->116 ->115 from baseline and actual delta", () => {
  const s = state();
  s.matches = [match("1", 1), match("2", -1)];
  assert.deepEqual(
    accountProgression(s).map((p) => p.stars),
    [115, 116, 115],
  );
  assert.equal(currentRank(s).tier, "Mythical Immortal");
});
test("players share one progression; each contribution and total playtime remain separate", () => {
  const s = state();
  s.matches = [
    { ...match("1", 1), durationSeconds: 750 },
    { ...match("2", 1, "gaurav"), durationSeconds: null },
    { ...match("3", -1), durationSeconds: 900 },
    { ...match("4", 0), durationSeconds: 1230 },
  ];
  const players = playerContributions(s, s.matches);
  assert.equal(currentRank(s).stars, 116);
  assert.equal(players[0]!.net, 0);
  assert.equal(players[1]!.net, 1);
  assert.equal(formatPlaytime(players[0]!.seconds), "48m");
  assert.equal(players[1]!.durationCoverage, 0);
  assert.equal(formatPlaytime(822 * 60), "13h 42m");
  assert.equal(formatPlaytime(45), "<1m");
});
test("daily endpoints carry across dates and omit unplayed dates and pretracking history", () => {
  const s = state();
  s.matches = [
    match("1", 1),
    match("2", 1),
    match("3", -1),
    match("4", 1, "gaurav", "2026-09-15T01:00:00Z"),
    match("5", 1, "rupesh", "2026-09-15T02:00:00Z"),
  ];
  const days = dailyProgression(s);
  assert.deepEqual(
    days.map((p) => [
      p.label,
      p.startingStars,
      p.stars,
      p.delta,
      p.games,
      p.wins,
      p.losses,
    ]),
    [
      ["2026-09-13", 115, 116, 1, 3, 2, 1],
      ["2026-09-15", 116, 118, 2, 2, 2, 0],
    ],
  );
  assert.equal(dailyProgression(state()).length, 0);
});
test("calendar grouping uses configured timezone at midnight", () => {
  const s = state();
  s.matches = [
    match("1", 1, "rupesh", "2026-09-13T18:14:00Z"),
    match("2", 1, "rupesh", "2026-09-13T18:15:00Z"),
  ];
  assert.deepEqual(
    dailyProgression(s).map((p) => p.label),
    ["2026-09-13", "2026-09-14"],
  );
});
test("Mythic medal promotion and demotion occur at all published thresholds", () => {
  for (const [threshold, label, below] of [
    [25, "Mythical Honor", "Mythic"],
    [50, "Mythical Glory", "Mythical Honor"],
    [100, "Mythical Immortal", "Mythical Glory"],
  ] as const) {
    const s = state(threshold - 1);
    s.matches = [match("1", 1)];
    assert.equal(currentRank(s).tier, label);
    s.matches.push(match("2", -1));
    assert.equal(currentRank(s).tier, below);
    assert.equal(currentRank(s).rankStars, threshold - 1);
  }
  assert.equal(
    rankLabel(advanceRank({ tier: "Epic", division: 1, stars: 5 }, 1)!),
    "Legend V",
  );
  assert.equal(
    rankLabel(advanceRank({ tier: "Legend", division: 5, stars: 0 }, -1)!),
    "Epic I",
  );
  assert.equal(advanceRank({ tier: "Legend", division: 1, stars: 5 }, 1), null);
  assert.equal(
    advanceRank({ tier: "Mythic", division: null, stars: 0 }, -1),
    null,
  );
});
test("rank display distinguishes division progress from continuous Mythic stars", () => {
  assert.deepEqual(getRankDisplay({ tier: "Epic", division: 2, stars: 3 }), {
    name: "Epic",
    division: "II",
    stars: "3/5 stars",
    progress: 60,
    progressLabel: "2 stars to promotion",
    tone: "violet",
  });
  assert.deepEqual(
    getRankDisplay({ tier: "Mythic", division: null, stars: 49 }),
    {
      name: "Mythical Honor",
      division: null,
      stars: "49 stars",
      progress: 96,
      progressLabel: "1 star to Mythical Glory",
      tone: "mythic",
    },
  );
  assert.equal(
    getRankDisplay({ tier: "Mythic", division: null, stars: 103 }).progress,
    100,
  );
});
test("dated reset suggestions cover current observed boundaries without becoming automatic facts", () => {
  for (const [ending, reset] of [
    [
      { tier: "Master", division: 4, stars: 4 },
      { tier: "Elite", division: 1, stars: 0 },
    ],
    [
      { tier: "Master", division: 1, stars: 4 },
      { tier: "Elite", division: 2, stars: 0 },
    ],
    [
      { tier: "Grandmaster", division: 5, stars: 5 },
      { tier: "Master", division: 1, stars: 0 },
    ],
    [
      { tier: "Grandmaster", division: 1, stars: 5 },
      { tier: "Grandmaster", division: 3, stars: 0 },
    ],
    [
      { tier: "Epic", division: 5, stars: 5 },
      { tier: "Grandmaster", division: 2, stars: 0 },
    ],
    [
      { tier: "Epic", division: 4, stars: 5 },
      { tier: "Grandmaster", division: 1, stars: 0 },
    ],
    [
      { tier: "Epic", division: 3, stars: 5 },
      { tier: "Epic", division: 5, stars: 0 },
    ],
    [
      { tier: "Epic", division: 1, stars: 5 },
      { tier: "Epic", division: 4, stars: 0 },
    ],
    [
      { tier: "Legend", division: 5, stars: 5 },
      { tier: "Epic", division: 4, stars: 0 },
    ],
    [
      { tier: "Legend", division: 1, stars: 5 },
      { tier: "Epic", division: 3, stars: 0 },
    ],
  ] as const)
    assert.deepEqual(getSeasonResetSuggestion(ending), reset);
  assert.deepEqual(
    getSeasonResetSuggestion({ tier: "Mythic", division: null, stars: 24 }),
    { tier: "Epic", division: 2, stars: 0 },
  );
  assert.deepEqual(
    getSeasonResetSuggestion({ tier: "Mythic", division: null, stars: 25 }),
    { tier: "Epic", division: 1, stars: 0 },
  );
  assert.deepEqual(
    getSeasonResetSuggestion({ tier: "Mythic", division: null, stars: 50 }),
    { tier: "Legend", division: 5, stars: 0 },
  );
  assert.equal(
    getSeasonResetSuggestion({ tier: "Elite", division: 1, stars: 4 }),
    null,
  );
  assert.equal(
    RANK_RULES.resetMapping.status,
    "secondary-sources-require-confirmation",
  );
});
test("unknown placement is not invented; confirmed Mythic checkpoint resumes rank derivation", () => {
  const s = state(5);
  s.push.startingRank = {
    tier: "Legend",
    division: 1,
    rulesVersion: RANK_RULES.version,
  };
  s.matches = [match("1", 1)];
  assert.equal(currentRank(s).needsRankConfirmation, true);
  assert.equal(currentRank(s).placementStatus, "pending");
  s.matches.push({ ...match("2", 10), mythicCheckpoint: 10 });
  assert.equal(currentRank(s).rankStars, 10);
  assert.equal(currentRank(s).placementStatus, "confirmed");
  s.matches.push(match("3", 1));
  assert.equal(currentRank(s).rankStars, 11);
});
test("confirmed rank checkpoints repair gaps and retain explicit placement state", () => {
  const s = state(5);
  s.push.startingRank = {
    tier: "Legend",
    division: 1,
    rulesVersion: RANK_RULES.version,
  };
  s.matches = [match("1", 1), match("2", 1)];
  assert.equal(currentRank(s).placementStatus, "pending");
  assert.equal(currentRank(s).position, null);
  s.matches.push({
    ...match("3", null),
    rankCheckpoint: {
      kind: "placement",
      position: {
        tier: "Mythic",
        division: null,
        stars: 12,
        rulesVersion: RANK_RULES.version,
      },
      confirmedAt: "2026-09-13T03:05:00Z",
      reason: "Placement result screen",
    },
  });
  assert.equal(currentRank(s).rankStars, 12);
  assert.equal(currentRank(s).placementStatus, "confirmed");
  s.matches.push(match("4", 1));
  assert.equal(currentRank(s).rankStars, 13);
  const corrected = saveMatch(
    s,
    {
      ...s.matches[2]!,
      rankCheckpoint: {
        ...s.matches[2]!.rankCheckpoint!,
        kind: "correction",
        position: {
          ...s.matches[2]!.rankCheckpoint!.position,
          stars: 20,
        },
        reason: "Corrected from a clearer rank screen",
      },
    },
    "Correct confirmed rank",
  );
  assert.equal(currentRank(corrected).rankStars, 21);
  assert.equal(
    (corrected.audit.at(-1)!.before as Match).rankCheckpoint!.position.stars,
    12,
  );
});
test("rank-aware targets compare tier, division and stars", () => {
  const s = state(100);
  s.push.targetRank = {
    tier: "Mythic",
    division: null,
    stars: 105,
    rulesVersion: RANK_RULES.version,
  };
  s.matches = [match("1", 1), match("2", 1), match("3", 1)];
  assert.deepEqual(rankTargetProgress(s), {
    target: s.push.targetRank,
    current: currentRank(s).position,
    remaining: 2,
    complete: false,
    percent: 60,
  });
  assert.throws(() =>
    stateSchema.parse({
      ...s,
      push: {
        ...s.push,
        targetRank: { ...s.push.targetRank!, stars: 99 },
      },
    }),
  );
});
test("nonranked matches affect playtime but not ranked stars, graph, or rank", () => {
  const s = state();
  s.matches = [
    match("1", 1),
    { ...match("2", null), mode: "classic", durationSeconds: 600 },
  ];
  assert.equal(currentRank(s).stars, 116);
  assert.equal(accountProgression(s).length, 2);
  assert.equal(stats(s.matches).net, 1);
  assert.equal(stats(s.matches).games, 2);
  assert.equal(dailyProgression(s)[0]!.games, 1);
});
test("missing duration stays incomplete; unknown deltas break progression instead of inventing zeros", () => {
  const s = state();
  s.matches = [
    { ...match("1", 1), durationSeconds: null },
    match("2", null),
    match("3", 1),
  ];
  assert.equal(stats(s.matches).durationCoverage, 2);
  assert.equal(currentRank(s).incomplete, true);
  assert.deepEqual(
    accountProgression(s).map((p) => p.stars),
    [115, 116, null, null],
  );
  assert.equal(dailyProgression(s)[0]!.stars, null);
});
test("edits, deletion, backdating and backup refresh recalculate without stale absolute observations", () => {
  const s = state();
  s.matches = [match("2", 1), match("3", 1)];
  const backdated = saveMatch(s, match("1", -1));
  assert.deepEqual(
    accountProgression(backdated).map((p) => p.stars),
    [115, 114, 115, 116],
  );
  const edited = saveMatch(
    backdated,
    { ...backdated.matches[0]!, starDelta: 2 },
    "correct bonus",
  );
  assert.equal(currentRank(edited).stars, 117);
  const removed = deleteMatch(edited, "1", "duplicate evidence");
  assert.equal(currentRank(removed).stars, 118);
  assert.equal(removed.audit.at(-1)!.action, "delete_match");
  assert.deepEqual(
    dailyProgression(parseBackup(JSON.stringify(removed))),
    dailyProgression(removed),
  );
  const before = JSON.stringify(removed);
  dailyProgression(removed);
  accountProgression(removed);
  dailyProgression(removed);
  assert.equal(JSON.stringify(removed), before);
});
test("old backups stay valid, explicit deltas override old observations, invalid starting ranks reject", () => {
  const legacy = stateSchema.parse(initialState());
  assert.equal(currentRank(legacy).stars, 117);
  const s = state();
  s.matches = [{ ...match("1", 2), starsBefore: 115, starsAfter: 116 }];
  assert.equal(currentRank(stateSchema.parse(s)).stars, 117);
  assert.throws(() =>
    stateSchema.parse({
      ...s,
      push: {
        ...s.push,
        startingRank: {
          tier: "Epic",
          division: 6,
          rulesVersion: RANK_RULES.version,
        },
      },
    }),
  );
  assert.throws(() =>
    stateSchema.parse({
      ...s,
      matches: [{ ...s.matches[0], mode: "classic" }],
    }),
  );
});
