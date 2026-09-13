import { z } from "zod";
import {
  advanceRank,
  rankLabel,
  startingRankSchema,
  RANK_RULES,
} from "./rank-rules";
import type { RankPosition } from "./rank-rules";

const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(80);
const count = z.number().int().min(0).max(1000000);
const instant = z.string().datetime({ offset: true });
export const playerSchema = z.object({ id, name }).strict();
export const heroSchema = z.object({ id, name }).strict();
export const matchSchema = z
  .object({
    id,
    playerId: id,
    heroId: id.nullable(),
    playedAt: instant,
    mode: z.enum(["ranked", "classic", "unknown"]),
    result: z.enum(["win", "loss", "draw", "unknown"]),
    kills: count.nullable(),
    deaths: count.nullable(),
    assists: count.nullable(),
    durationSeconds: z.number().int().positive().max(86400).nullable(),
    starsBefore: count.nullable(),
    starsAfter: count.nullable(),
    starDelta: z.number().int().min(-10000).max(10000).nullable().optional(),
    mythicCheckpoint: count.optional(),
    rankTier: z.string().trim().max(80),
    source: z.enum(["manual", "screenshot_review"]),
    notes: z.string().max(2000),
    createdAt: instant,
    updatedAt: instant,
  })
  .strict()
  .superRefine((m, ctx) => {
    if (
      m.mode !== "ranked" &&
      (m.starsBefore !== null ||
        m.starsAfter !== null ||
        m.starDelta != null ||
        m.mythicCheckpoint !== undefined)
    )
      ctx.addIssue({
        code: "custom",
        message: "Only ranked matches can record rank stars.",
      });
  });
export type Match = z.infer<typeof matchSchema>;
export const stateSchema = z
  .object({
    format: z.literal("mlbb-manual-tracker"),
    version: z.literal(1),
    dataset: z.enum(["real", "demo"]),
    revision: z.number().int().nonnegative(),
    players: z.array(playerSchema).min(1).max(100),
    heroes: z.array(heroSchema).max(1000),
    push: z
      .object({
        name,
        season: z.string().max(80),
        timezone: z.string().refine((value) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone: value });
            return true;
          } catch {
            return false;
          }
        }, "Use a valid timezone, e.g. Asia/Kathmandu."),
        rankTier: z.string().trim().max(80),
        startingStars: count,
        startingRank: startingRankSchema.optional(),
        targetStars: count.nullable(),
      })
      .strict(),
    matches: z.array(matchSchema).max(20000),
    audit: z
      .array(
        z
          .object({
            id,
            at: instant,
            action: z.enum(["edit_match", "delete_match", "settings"]),
            note: z.string().min(1).max(300),
            before: z.union([matchSchema, z.record(z.string(), z.unknown())]),
          })
          .strict(),
      )
      .max(50000),
  })
  .strict()
  .superRefine((state, ctx) => {
    for (const [label, records] of [
      ["players", state.players],
      ["heroes", state.heroes],
      ["matches", state.matches],
    ] as const) {
      if (new Set(records.map((r) => r.id)).size !== records.length)
        ctx.addIssue({ code: "custom", message: `Duplicate ${label} IDs.` });
    }
    for (const m of state.matches) {
      if (!state.players.some((p) => p.id === m.playerId))
        ctx.addIssue({ code: "custom", message: "Unknown player reference." });
      if (m.heroId !== null && !state.heroes.some((h) => h.id === m.heroId))
        ctx.addIssue({ code: "custom", message: "Unknown hero reference." });
    }
    if (
      new Set(state.matches.map((m) => Date.parse(m.playedAt))).size !==
      state.matches.length
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Multiple matches have the same time. Resolve duplicate records before import.",
      });
    }
    if (
      state.push.startingRank &&
      state.push.startingRank.tier !== "Mythic" &&
      state.push.startingStars >
        RANK_RULES.divisions[state.push.startingRank.tier].stars
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Starting stars exceed the selected division. Enter the stars shown in-game.",
      });
    const tiers = new Set(
      [
        state.push.rankTier,
        ...state.matches
          .filter((m) => m.starsBefore !== null || m.starsAfter !== null)
          .map((m) => m.rankTier),
      ]
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    );
    if (!state.push.startingRank && tiers.size > 1)
      ctx.addIssue({
        code: "custom",
        message:
          "This push tracks stars within one tier. For a different tier, leave star fields blank and record the rank in notes until tier transitions are supported.",
      });
  });
export type TrackerState = z.infer<typeof stateSchema>;
export type Dataset = TrackerState["dataset"];

export function starChange(match: Match): number | null {
  if (match.mode !== "ranked") return null;
  if (match.starDelta !== undefined) return match.starDelta;
  return match.mode === "ranked" &&
    match.starsBefore !== null &&
    match.starsAfter !== null
    ? match.starsAfter - match.starsBefore
    : null;
}
export function ordered(matches: Match[]): Match[] {
  return [...matches].sort(
    (a, b) =>
      Date.parse(a.playedAt) - Date.parse(b.playedAt) ||
      a.id.localeCompare(b.id),
  );
}
export function stats(matches: Match[]) {
  const rankedGames = matches.filter((m) => m.mode === "ranked").length;
  const wins = matches.filter((m) => m.result === "win").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const changes = matches
    .map(starChange)
    .filter((n): n is number => n !== null);
  const durations = matches.flatMap((m) =>
    m.durationSeconds === null ? [] : [m.durationSeconds],
  );
  return {
    games: matches.length,
    rankedGames,
    wins,
    losses,
    winRate: wins + losses ? (wins / (wins + losses)) * 100 : null,
    knownNet: changes.reduce((a, b) => a + b, 0),
    starCoverage: changes.length,
    net:
      changes.length === rankedGames && rankedGames > 0
        ? changes.reduce((a, b) => a + b, 0)
        : null,
    seconds: durations.reduce((a, b) => a + b, 0),
    durationCoverage: durations.length,
  };
}
export function currentRank(state: TrackerState) {
  const points = accountProgression(state);
  const latest = points.at(-1);
  const known = [...points].reverse().find((p) => p.stars !== null);
  const position = latest?.rank ?? null;
  return {
    stars: latest?.stars ?? known?.stars ?? state.push.startingStars,
    rankStars: position?.stars ?? null,
    tier: position ? rankLabel(position) : "",
    at: latest?.playedAt ?? null,
    incomplete: latest?.stars === null,
    needsRankConfirmation: Boolean(state.push.startingRank && !position),
  };
}

export function accountProgression(state: TrackerState) {
  let stars: number | null = state.push.startingStars;
  let rank: RankPosition | null = state.push.startingRank
    ? { ...state.push.startingRank, stars }
    : null;
  const baseline = {
    label: "Start",
    playedAt: null as string | null,
    stars,
    startingStars: stars as number | null,
    delta: 0 as number | null,
    rank,
    player: "Account baseline",
  };
  return [
    baseline,
    ...ordered(state.matches)
      .filter((m) => m.mode === "ranked")
      .map((m, i) => {
        const before = stars;
        const delta = starChange(m);
        stars = stars === null || delta === null ? null : stars + delta;
        rank =
          rank === null || delta === null ? null : advanceRank(rank, delta);
        if (m.mythicCheckpoint !== undefined)
          rank = { tier: "Mythic", division: null, stars: m.mythicCheckpoint };
        return {
          label: String(i + 1),
          playedAt: m.playedAt,
          stars,
          startingStars: before,
          delta,
          rank,
          player: state.players.find((p) => p.id === m.playerId)!.name,
        };
      }),
  ];
}
export function dailyProgression(state: TrackerState) {
  const points = accountProgression(state).slice(1);
  const days = new Map<
    string,
    {
      label: string;
      stars: number | null;
      startingStars: number | null;
      delta: number | null;
      games: number;
      wins: number;
      losses: number;
      rank: RankPosition | null;
      player: string;
    }
  >();
  const ranked = ordered(state.matches).filter((m) => m.mode === "ranked");
  points.forEach((p, i) => {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: state.push.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(p.playedAt!));
    const existing = days.get(day);
    const start = existing ? existing.startingStars : p.startingStars;
    days.set(day, {
      label: day,
      stars: p.stars,
      startingStars: start,
      delta:
        existing?.delta === null || p.delta === null
          ? null
          : (existing?.delta ?? 0) + p.delta,
      games: (existing?.games ?? 0) + 1,
      wins: (existing?.wins ?? 0) + (ranked[i]!.result === "win" ? 1 : 0),
      losses: (existing?.losses ?? 0) + (ranked[i]!.result === "loss" ? 1 : 0),
      rank: p.rank,
      player: day,
    });
  });
  return [...days.values()]; // Omit unplayed dates; never invent pre-tracking history.
}
export function formatPlaytime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes < 1 && seconds > 0
    ? "<1m"
    : minutes < 60
      ? `${minutes}m`
      : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function playerContributions(state: TrackerState, matches: Match[]) {
  return state.players.map((player) => ({
    player,
    ...stats(matches.filter((m) => m.playerId === player.id)),
  }));
}
export function deleteMatch(
  state: TrackerState,
  id: string,
  reason: string,
): TrackerState {
  const before = state.matches.find((m) => m.id === id);
  if (!before || !reason.trim())
    throw new Error("Choose a match and explain the deletion.");
  return stateSchema.parse({
    ...state,
    matches: state.matches.filter((m) => m.id !== id),
    audit: [
      ...state.audit,
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        action: "delete_match",
        note: reason.trim(),
        before,
      },
    ],
  });
}
export function saveMatch(
  state: TrackerState,
  input: unknown,
  correctionNote = "",
): TrackerState {
  const match = matchSchema.parse(input);
  const previous = state.matches.find((m) => m.id === match.id);
  if (previous && !correctionNote.trim())
    throw new Error("Please explain this correction.");
  if (
    state.matches.some(
      (m) =>
        m.id !== match.id &&
        Date.parse(m.playedAt) === Date.parse(match.playedAt),
    )
  )
    throw new Error(
      "A match is already recorded at this time. Edit it, or check the time before adding.",
    );
  const next = {
    ...state,
    matches: previous
      ? state.matches.map((m) =>
          m.id === match.id
            ? {
                ...match,
                createdAt: previous.createdAt,
                source: previous.source,
              }
            : m,
        )
      : [...state.matches, match],
    audit: previous
      ? [
          ...state.audit,
          {
            id: crypto.randomUUID(),
            at: match.updatedAt,
            action: "edit_match" as const,
            note: correctionNote.trim(),
            before: previous,
          },
        ]
      : state.audit,
  };
  return stateSchema.parse(next);
}
export function heroStats(state: TrackerState, matches: Match[]) {
  return state.players
    .flatMap((player) =>
      state.heroes.flatMap((hero) => {
        const group = matches.filter(
          (m) => m.playerId === player.id && m.heroId === hero.id,
        );
        return group.length ? [{ player, hero, ...stats(group) }] : [];
      }),
    )
    .sort((a, b) => b.games - a.games);
}
