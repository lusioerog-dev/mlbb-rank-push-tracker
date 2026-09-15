import { z } from "zod";

// See docs/rank-rules.md for evidence and deliberate uncertainty boundaries.
export const RANK_RULES = {
  version: "mlbb-stars-2026-09",
  reviewedAt: "2026-09-15",
  resetMapping: {
    status: "secondary-sources-require-confirmation",
    season: "Season 41 to Season 42",
  },
  divisions: {
    Warrior: { count: 3, stars: 3 },
    Elite: { count: 3, stars: 4 },
    Master: { count: 4, stars: 4 },
    Grandmaster: { count: 5, stars: 5 },
    Epic: { count: 5, stars: 5 },
    Legend: { count: 5, stars: 5 },
  },
  mythic: [
    { name: "Mythic", minimum: 0 },
    { name: "Mythical Honor", minimum: 25 },
    { name: "Mythical Glory", minimum: 50 },
    { name: "Mythical Immortal", minimum: 100 },
  ],
} as const;
export const rankTiers = [
  "Warrior",
  "Elite",
  "Master",
  "Grandmaster",
  "Epic",
  "Legend",
  "Mythic",
] as const;
export const startingRankSchema = z
  .object({
    tier: z.enum(rankTiers),
    division: z.number().int().min(1).max(5).nullable(),
    rulesVersion: z.literal(RANK_RULES.version),
  })
  .strict()
  .superRefine((rank, ctx) => {
    if (
      rank.tier === "Mythic"
        ? rank.division !== null
        : rank.division === null ||
          rank.division > RANK_RULES.divisions[rank.tier].count
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose a valid starting rank division.",
      });
  });
export type StartingRank = z.infer<typeof startingRankSchema>;
export interface RankPosition {
  tier: StartingRank["tier"];
  division: number | null;
  stars: number;
}
export const rankPositionSchema = z
  .object({
    tier: z.enum(rankTiers),
    division: z.number().int().min(1).max(5).nullable(),
    stars: z.number().int().min(0).max(1000000),
    rulesVersion: z.literal(RANK_RULES.version),
  })
  .strict()
  .superRefine((rank, ctx) => {
    if (
      rank.tier === "Mythic"
        ? rank.division !== null
        : rank.division === null ||
          rank.division > RANK_RULES.divisions[rank.tier].count ||
          rank.stars > RANK_RULES.divisions[rank.tier].stars
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose a valid rank, division and star count.",
      });
  });
export type ConfirmedRank = z.infer<typeof rankPositionSchema>;

export type RankDisplay = {
  name: string;
  division: string | null;
  stars: string;
  progress: number;
  progressLabel: string;
  tone: "bronze" | "silver" | "gold" | "emerald" | "violet" | "mythic";
};

export function rankOrder(position: RankPosition) {
  let order = 0;
  for (const tier of rankTiers) {
    if (tier === "Mythic")
      return position.tier === "Mythic" ? order + position.stars : order;
    const rule = RANK_RULES.divisions[tier];
    if (tier === position.tier)
      return (
        order + (rule.count - position.division!) * rule.stars + position.stars
      );
    order += rule.count * rule.stars;
  }
  return order;
}
const roman = ["", "I", "II", "III", "IV", "V"];
export function rankLabel(rank: RankPosition) {
  if (rank.tier === "Mythic")
    return [...RANK_RULES.mythic]
      .reverse()
      .find((r) => rank.stars >= r.minimum)!.name;
  return `${rank.tier} ${roman[rank.division!]}`;
}

export function getRankDisplay(position: RankPosition): RankDisplay {
  if (position.tier === "Mythic") {
    const bands = [...RANK_RULES.mythic];
    const band = [...bands]
      .reverse()
      .find((candidate) => position.stars >= candidate.minimum)!;
    const next = bands[bands.indexOf(band) + 1];
    const progress = next
      ? ((position.stars - band.minimum) / (next.minimum - band.minimum)) * 100
      : 100;
    return {
      name: band.name,
      division: null,
      stars: `${position.stars} stars`,
      progress: Math.min(100, Math.max(0, progress)),
      progressLabel: next
        ? `${next.minimum - position.stars} star${next.minimum - position.stars === 1 ? "" : "s"} to ${next.name}`
        : "Mythical Immortal",
      tone: "mythic",
    };
  }
  const rule = RANK_RULES.divisions[position.tier];
  const tone = {
    Warrior: "bronze",
    Elite: "silver",
    Master: "gold",
    Grandmaster: "emerald",
    Epic: "violet",
    Legend: "gold",
  }[position.tier] as RankDisplay["tone"];
  return {
    name: position.tier,
    division: roman[position.division!]!,
    stars: `${position.stars}/${rule.stars} stars`,
    progress: (position.stars / rule.stars) * 100,
    progressLabel:
      position.stars === rule.stars
        ? "Next earned star promotes"
        : `${rule.stars - position.stars} stars to promotion`,
    tone,
  };
}

/**
 * Dated Season 41 -> 42 reset suggestion from corroborating secondary sources.
 * The game result must still be confirmed because Moonton publishes no stable
 * machine-readable reset contract and can change the table between seasons.
 */
export function getSeasonResetSuggestion(
  ending: RankPosition,
): RankPosition | null {
  const reset = (
    tier: Exclude<StartingRank["tier"], "Mythic">,
    division: number,
  ): RankPosition => ({ tier, division, stars: 0 });
  if (ending.tier === "Mythic") {
    if (ending.stars >= 50) return reset("Legend", 5);
    if (ending.stars >= 25) return reset("Epic", 1);
    return reset("Epic", 2);
  }
  const division = ending.division!;
  // Available reset charts do not specify a division for these two rows.
  if (ending.tier === "Warrior" || ending.tier === "Elite") return null;
  if (ending.tier === "Master") return reset("Elite", division >= 3 ? 1 : 2);
  if (ending.tier === "Grandmaster") {
    if (division === 5) return reset("Master", 1);
    if (division === 4) return reset("Master", 2);
    return reset("Grandmaster", division + 2);
  }
  if (ending.tier === "Epic") {
    if (division === 5) return reset("Grandmaster", 2);
    if (division === 4) return reset("Grandmaster", 1);
    if (division === 1) return reset("Epic", 4);
    return reset("Epic", 5);
  }
  return reset("Epic", division === 5 ? 4 : 3);
}
export function advanceRank(
  position: RankPosition,
  delta: number,
): RankPosition | null {
  let rank = { ...position };
  if (rank.tier === "Mythic") {
    // Mythic -> Legend demotion/placement rules are not safely verified.
    return rank.stars + delta < 0
      ? null
      : { ...rank, stars: rank.stars + delta };
  }
  const direction = Math.sign(delta);
  for (let remaining = Math.abs(delta); remaining > 0; remaining--) {
    if (rank.tier === "Mythic") return null;
    const rule = RANK_RULES.divisions[rank.tier];
    rank.stars += direction;
    if (rank.stars > rule.stars) {
      if (rank.division! > 1)
        rank = { ...rank, division: rank.division! - 1, stars: 1 };
      else {
        const tier = rankTiers[rankTiers.indexOf(rank.tier) + 1]!;
        // Entering Mythic triggers placement. Never invent its award.
        if (tier === "Mythic") return null;
        rank = { tier, division: RANK_RULES.divisions[tier].count, stars: 1 };
      }
    } else if (rank.stars < 0) {
      if (rank.tier === "Warrior") return null; // Actual protection should be recorded as delta 0.
      if (rank.division! < rule.count)
        rank = { ...rank, division: rank.division! + 1, stars: rule.stars - 1 };
      else {
        const tier = rankTiers[rankTiers.indexOf(rank.tier) - 1] as Exclude<
          StartingRank["tier"],
          "Mythic"
        >;
        rank = {
          tier,
          division: 1,
          stars: RANK_RULES.divisions[tier].stars - 1,
        };
      }
    }
  }
  return rank;
}
