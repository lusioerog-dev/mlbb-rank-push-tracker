import { stateSchema } from "./model";
import type { TrackerState } from "./model";

// Keep the deployed snapshot/wire format at the boundary during the phased
// refactor. The application has one state and no dataset selection.
export function readState(input: unknown): TrackerState {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const legacy = input as Record<string, unknown>;
    if (legacy.version === 1 && legacy.dataset === "real") {
      const state = { ...legacy };
      delete state.dataset;
      return stateSchema.parse({ ...state, version: 2 });
    }
  }
  // Legacy demo snapshots and unknown versions must never become real matches.
  return stateSchema.parse(input);
}

export function writeCompatibleState(state: TrackerState) {
  return {
    ...stateSchema.parse(state),
    version: 1 as const,
    dataset: "real" as const,
  };
}
