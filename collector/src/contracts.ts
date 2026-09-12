/** Research interfaces only; these are not the application's match contract. */
export interface SourceEntry {
  id: string;
}

export interface FightHistorySource {
  listEntries(): Promise<SourceEntry[]>;
  readEntry(id: string): Promise<Uint8Array>;
}

/** A decoder must retain evidence separately from business normalization. */
export interface ParsedFightHistory {
  formatRevision: string;
  observations: Readonly<Record<string, unknown>>;
  warnings: readonly string[];
}

export interface FightHistoryParser {
  version: string;
  canParse(input: Uint8Array): boolean;
  parse(input: Uint8Array): ParsedFightHistory;
}
