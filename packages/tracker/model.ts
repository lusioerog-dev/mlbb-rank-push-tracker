import { z } from "zod";
import { playerName } from "./players";
import {
  advanceRank,
  rankOrder,
  rankLabel,
  rankPositionSchema,
  startingRankSchema,
  RANK_RULES,
} from "./rank-rules";
import type { RankPosition } from "./rank-rules";

const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(80);
const count = z.number().int().min(0).max(1000000);
const instant = z.string().datetime({ offset: true });
const externalId = z.string().trim().min(1).max(100);
// Retain original stored names as historical data; display uses fixed identities.
export const playerSchema = z
  .object({ id: z.enum(["gaurav", "rupesh"]), name })
  .strict();
export const heroSchema = z
  .object({
    id,
    name,
    gameId: externalId.nullable().optional(),
    aliases: z.array(name).max(50).optional(),
  })
  .strict();
export const playedPositionSchema = z
  .enum(["exp_lane", "gold_lane", "mid_lane", "roam", "jungle"])
  .nullable();
export type PlayedPosition = z.infer<typeof playedPositionSchema>;
const heroObservationSchema = z
  .object({
    name: name.nullable(),
    gameId: externalId.nullable(),
  })
  .strict()
  .refine((value) => value.name !== null || value.gameId !== null, {
    message: "A hero observation needs a name or verified game ID.",
  });
export const rankCheckpointSchema = z
  .object({
    kind: z.enum(["placement", "observation", "correction"]),
    position: rankPositionSchema,
    confirmedAt: instant,
    reason: z.string().trim().min(1).max(300),
  })
  .strict();
export const matchSchema = z
  .object({
    id,
    battleId: externalId.nullable().optional(),
    playerId: id,
    heroId: id.nullable(),
    heroObservation: heroObservationSchema.nullable().optional(),
    playedPosition: playedPositionSchema.optional(),
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
    rankCheckpoint: rankCheckpointSchema.optional(),
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
        m.mythicCheckpoint !== undefined ||
        m.rankCheckpoint !== undefined)
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
    version: z.literal(2),
    revision: z.number().int().nonnegative(),
    players: z.array(playerSchema).length(2),
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
        targetRank: rankPositionSchema.nullable().optional(),
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
    const battleIds = state.matches.flatMap((match) =>
      match.battleId == null ? [] : [match.battleId],
    );
    if (new Set(battleIds).size !== battleIds.length)
      ctx.addIssue({ code: "custom", message: "Duplicate Battle ID." });
    const heroGameIds = state.heroes.flatMap((hero) =>
      hero.gameId == null ? [] : [hero.gameId],
    );
    if (new Set(heroGameIds).size !== heroGameIds.length)
      ctx.addIssue({ code: "custom", message: "Duplicate verified hero ID." });
    const heroNames = state.heroes.flatMap((hero) =>
      [hero.name, ...(hero.aliases ?? [])].map((value) =>
        value.trim().toLocaleLowerCase(),
      ),
    );
    if (new Set(heroNames).size !== heroNames.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate hero name or alias.",
      });
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
    if (!state.push.startingRank && state.push.targetRank)
      ctx.addIssue({
        code: "custom",
        message:
          "Choose the season starting rank before setting a rank target.",
      });
    if (state.push.startingRank && state.push.targetRank) {
      const start = {
        ...state.push.startingRank,
        stars: state.push.startingStars,
      };
      if (rankOrder(state.push.targetRank) <= rankOrder(start))
        ctx.addIssue({
          code: "custom",
          message: "The rank target must be above the season starting rank.",
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
    position,
    at: latest?.playedAt ?? null,
    incomplete: latest?.stars === null,
    needsRankConfirmation: Boolean(state.push.startingRank && !position),
    placementStatus: latest?.placementPending
      ? ("pending" as const)
      : state.matches.some(
            (match) =>
              match.rankCheckpoint?.kind === "placement" ||
              match.mythicCheckpoint !== undefined,
          )
        ? ("confirmed" as const)
        : ("not_required" as const),
  };
}

export function resolvedRankTarget(state: TrackerState) {
  if (state.push.targetRank) return state.push.targetRank;
  return state.push.startingRank?.tier === "Mythic" &&
    state.push.targetStars !== null
    ? {
        tier: "Mythic" as const,
        division: null,
        stars: state.push.targetStars,
        rulesVersion: RANK_RULES.version,
      }
    : null;
}

export function rankTargetProgress(state: TrackerState) {
  const target = resolvedRankTarget(state);
  const current = currentRank(state).position;
  if (!target || !state.push.startingRank || !current) return null;
  const start = rankOrder({
    ...state.push.startingRank,
    stars: state.push.startingStars,
  });
  const now = rankOrder(current);
  const end = rankOrder(target);
  if (end <= start) return null;
  return {
    target,
    current,
    remaining: Math.max(0, end - now),
    complete: now >= end,
    percent: Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)),
  };
}

export function accountProgression(state: TrackerState) {
  let stars: number | null = state.push.startingStars;
  let rank: RankPosition | null = state.push.startingRank
    ? { ...state.push.startingRank, stars }
    : null;
  let placementPending = false;
  const baseline = {
    label: "Start",
    playedAt: null as string | null,
    stars,
    startingStars: stars as number | null,
    delta: 0 as number | null,
    rank,
    placementPending,
    player: "Account baseline",
  };
  return [
    baseline,
    ...ordered(state.matches)
      .filter((m) => m.mode === "ranked")
      .map((m, i) => {
        const before = stars;
        const beforeRank = rank;
        const delta = starChange(m);
        stars = stars === null || delta === null ? null : stars + delta;
        rank =
          rank === null || delta === null ? null : advanceRank(rank, delta);
        placementPending =
          placementPending ||
          Boolean(
            beforeRank?.tier === "Legend" &&
            beforeRank.division === 1 &&
            delta !== null &&
            beforeRank.stars + delta > RANK_RULES.divisions.Legend.stars &&
            rank === null,
          );
        if (m.rankCheckpoint) {
          rank = m.rankCheckpoint.position;
          placementPending = false;
          if (rank.tier === "Mythic") stars = rank.stars;
        } else if (m.mythicCheckpoint !== undefined) {
          rank = { tier: "Mythic", division: null, stars: m.mythicCheckpoint };
          placementPending = false;
        }
        return {
          label: String(i + 1),
          playedAt: m.playedAt,
          stars,
          startingStars: before,
          delta,
          rank,
          placementPending,
          player: playerName(m.playerId),
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
  if (
    match.battleId !== null &&
    match.battleId !== undefined &&
    state.matches.some(
      (candidate) =>
        candidate.id !== match.id && candidate.battleId === match.battleId,
    )
  )
    throw new Error("This Battle ID is already recorded in the season.");
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

export function recordHeroObservation(
  state: TrackerState,
  observedName: string,
  observedGameId: string,
  newId: string = crypto.randomUUID(),
) {
  const heroName = observedName.trim();
  const gameId = observedGameId.trim();
  if (!heroName && !gameId)
    return {
      state,
      heroId: null,
      observation: null,
    };
  const byGameId = gameId
    ? state.heroes.find((hero) => hero.gameId === gameId)
    : undefined;
  const normalized = heroName.toLocaleLowerCase();
  const byName = heroName
    ? state.heroes.find((hero) =>
        [hero.name, ...(hero.aliases ?? [])].some(
          (candidate) => candidate.toLocaleLowerCase() === normalized,
        ),
      )
    : undefined;
  if (byGameId && byName && byGameId.id !== byName.id)
    throw new Error("The hero name and verified ID refer to different heroes.");
  const existing = byGameId ?? byName;
  if (!existing && !heroName)
    throw new Error("Enter a hero name with a new verified hero ID.");
  if (existing?.gameId && gameId && existing.gameId !== gameId)
    throw new Error("This hero name already has a different verified ID.");
  const observation = {
    name: heroName || null,
    gameId: gameId || null,
  };
  if (!existing) {
    const hero = {
      id: newId,
      name: heroName,
      gameId: gameId || null,
      aliases: [] as string[],
    };
    return {
      state: stateSchema.parse({ ...state, heroes: [...state.heroes, hero] }),
      heroId: hero.id,
      observation,
    };
  }
  const aliases = [...(existing.aliases ?? [])];
  if (
    heroName &&
    heroName.toLocaleLowerCase() !== existing.name.toLocaleLowerCase() &&
    !aliases.some(
      (candidate) =>
        candidate.toLocaleLowerCase() === heroName.toLocaleLowerCase(),
    )
  )
    aliases.push(heroName);
  const updated = {
    ...existing,
    gameId: existing.gameId ?? (gameId || null),
    aliases,
  };
  return {
    state: stateSchema.parse({
      ...state,
      heroes: state.heroes.map((hero) =>
        hero.id === updated.id ? updated : hero,
      ),
    }),
    heroId: updated.id,
    observation,
  };
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
