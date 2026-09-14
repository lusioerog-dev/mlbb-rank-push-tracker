import { stateSchema, type TrackerState } from "./model";

// Season snapshots live in the existing append-only correction history. This
// keeps older clients/backups compatible without a production schema migration.
export function startSeason(
  state: TrackerState,
  push: TrackerState["push"],
): TrackerState {
  if (!push.season.trim() || push.season.trim() === state.push.season.trim())
    throw new Error("Enter a new, distinct season name.");
  if (!push.startingRank)
    throw new Error("Choose the new starting rank shown in-game.");
  return stateSchema.parse({
    ...state,
    push,
    matches: [],
    audit: [
      ...state.audit,
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        action: "settings",
        note: `Archived ${state.push.season || state.push.name}; started ${push.season}.`.slice(
          0,
          300,
        ),
        before: {
          seasonArchive: {
            push: state.push,
            players: state.players,
            heroes: state.heroes,
            matches: state.matches,
          },
        },
      },
    ],
  });
}

export function archivedSeasons(state: TrackerState) {
  return state.audit.flatMap((entry) => {
    const before = entry.before as Record<string, unknown>;
    if (!before.seasonArchive || typeof before.seasonArchive !== "object")
      return [];
    const parsed = stateSchema.safeParse({
      format: state.format,
      version: state.version,
      revision: 0,
      ...before.seasonArchive,
      audit: [],
    });
    return parsed.success
      ? [{ id: entry.id, at: entry.at, state: parsed.data }]
      : [];
  });
}
