import { stateSchema, starChange } from "./model";
import type { Dataset, TrackerState } from "./model";
import { initialState } from "./seed";
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const storageKey = (dataset: Dataset) => `mlbb-manual-v1-${dataset}`;
export function loadState(
  storage: StoragePort,
  dataset: Dataset,
): TrackerState {
  const raw = storage.getItem(storageKey(dataset));
  if (raw === null) return initialState(dataset);
  const value = stateSchema.parse(JSON.parse(raw));
  if (value.dataset !== dataset)
    throw new Error("Saved data belongs to a different tracker.");
  return value;
}
export function persistState(
  storage: StoragePort,
  next: TrackerState,
  expectedRevision: number,
): TrackerState {
  const current = storage.getItem(storageKey(next.dataset));
  if (
    current !== null &&
    stateSchema.parse(JSON.parse(current)).revision !== expectedRevision
  )
    throw new Error("Another tab changed this tracker. Reload before saving.");
  const saved = stateSchema.parse({ ...next, revision: expectedRevision + 1 });
  storage.setItem(storageKey(saved.dataset), JSON.stringify(saved));
  return saved;
}
export function parseBackup(raw: string, dataset: Dataset) {
  const state = stateSchema.parse(JSON.parse(raw));
  if (state.dataset !== dataset)
    throw new Error(
      "Switch to the matching real/demo tracker before restoring this backup.",
    );
  return state;
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
      "dataset",
      "player",
      "hero",
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
      state.dataset,
      state.players.find((p) => p.id === m.playerId)!.name,
      state.heroes.find((h) => h.id === m.heroId)?.name ?? null,
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
