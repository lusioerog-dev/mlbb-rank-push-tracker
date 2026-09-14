import { stateSchema, starChange } from "./model";
import type { TrackerState } from "./model";
import { initialState } from "./seed";
import { readState, writeCompatibleState } from "./compatibility";
import { playerName } from "./players";
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
// Preserve the existing real-data key, including unreadable recovery data.
export const storageKey = "mlbb-manual-v1-real";
export function loadState(storage: StoragePort): TrackerState {
  const raw = storage.getItem(storageKey);
  return raw === null ? initialState() : readState(JSON.parse(raw));
}
export function persistState(
  storage: StoragePort,
  next: TrackerState,
  expectedRevision: number,
): TrackerState {
  const current = storage.getItem(storageKey);
  if (
    current !== null &&
    readState(JSON.parse(current)).revision !== expectedRevision
  )
    throw new Error("Another tab changed this tracker. Reload before saving.");
  const saved = stateSchema.parse({ ...next, revision: expectedRevision + 1 });
  storage.setItem(storageKey, JSON.stringify(writeCompatibleState(saved)));
  return saved;
}
export function parseBackup(raw: string) {
  return readState(JSON.parse(raw));
}
const csvCell = (value: string | number | null) => {
  let text = value === null ? "" : String(value);
  if (typeof value === "string" && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
export function exportCsv(state: TrackerState) {
  const rows: Array<Array<string | number | null>> = [
    [
      "id",
      "battle_id",
      "player",
      "hero",
      "hero_game_id",
      "observed_hero_name",
      "observed_hero_game_id",
      "position_played",
      "played_at",
      "mode",
      "result",
      "kills",
      "deaths",
      "assists",
      "duration_seconds",
      "stars_before",
      "stars_after",
      "star_delta",
      "mythic_checkpoint",
      "rank_tier",
      "source",
      "notes",
    ],
  ];
  for (const m of state.matches)
    rows.push([
      m.id,
      m.battleId ?? null,
      playerName(m.playerId),
      state.heroes.find((h) => h.id === m.heroId)?.name ?? null,
      state.heroes.find((h) => h.id === m.heroId)?.gameId ?? null,
      m.heroObservation?.name ?? null,
      m.heroObservation?.gameId ?? null,
      m.playedPosition ?? null,
      m.playedAt,
      m.mode,
      m.result,
      m.kills,
      m.deaths,
      m.assists,
      m.durationSeconds,
      m.starsBefore,
      m.starsAfter,
      starChange(m),
      m.mythicCheckpoint ?? null,
      m.rankTier,
      m.source,
      m.notes,
    ]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
