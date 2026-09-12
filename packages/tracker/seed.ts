import type { Dataset, Match, TrackerState } from "./model";
const stamp = "2026-09-12T22:00:00+05:45";
export function initialState(dataset: Dataset): TrackerState {
  const rows: Array<
    [
      string,
      string,
      Match["result"],
      number,
      number,
      number,
      number,
      number | null,
      number | null,
      Match["mode"],
    ]
  > =
    dataset === "real"
      ? [
          ["18:06", "gaurav", "loss", 3, 4, 6, 774, 115, 114, "ranked"],
          ["18:34", "gaurav", "win", 7, 3, 12, 681, 114, 115, "ranked"],
          ["18:51", "gaurav", "win", 7, 3, 12, 855, 115, 116, "ranked"],
          ["19:11", "gaurav", "win", 15, 0, 6, 693, 116, 117, "ranked"],
        ]
      : [
          ["12:58", "rupesh", "loss", 2, 6, 3, 700, 115, 114, "ranked"],
          ["13:15", "rupesh", "win", 9, 3, 11, 1098, 114, 115, "ranked"],
          ["13:40", "rupesh", "loss", 2, 7, 5, 789, 115, 114, "ranked"],
          ["14:47", "rupesh", "loss", 7, 2, 5, 883, 114, 114, "ranked"],
          ["15:08", "gaurav", "win", 6, 3, 10, 787, 114, 115, "ranked"],
          ["15:27", "gaurav", "win", 10, 0, 4, 780, 115, 116, "ranked"],
          ["15:47", "gaurav", "loss", 2, 4, 2, 672, 116, 115, "ranked"],
        ];
  return {
    format: "mlbb-manual-tracker",
    version: 1,
    dataset,
    revision: 0,
    players: [
      { id: "rupesh", name: "Rupesh" },
      { id: "gaurav", name: "Gaurav" },
    ],
    heroes: [],
    push: {
      name: "The shared climb",
      season: "",
      timezone: "Asia/Kathmandu",
      rankTier: "",
      startingStars: 115,
      targetStars: null,
    },
    matches: rows.map(
      (
        [
          time,
          playerId,
          result,
          kills,
          deaths,
          assists,
          durationSeconds,
          starsBefore,
          starsAfter,
          mode,
        ],
        index,
      ) => ({
        id: `${dataset}-screenshot-${index + 1}`,
        playerId,
        heroId: null,
        playedAt: `2026-09-12T${time}:00+05:45`,
        mode,
        result,
        kills,
        deaths,
        assists,
        durationSeconds,
        starsBefore,
        starsAfter,
        rankTier: "",
        source: "screenshot_review",
        notes: `${dataset === "demo" ? "DEMO player assignment; actual human unknown. " : "Gaurav attribution confirmed by user. "}Screen time transcribed; year and Nepal offset assumed from conversation. Hero and rank tier await confirmation.`,
        createdAt: stamp,
        updatedAt: stamp,
      }),
    ),
    audit: [],
  };
}
