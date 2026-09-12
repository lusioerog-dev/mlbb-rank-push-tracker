# Manual MVP — 2026-09-12

## User-approved scope change

After deferring FightHistory collection, the user explicitly chose to continue with a manual-entry MVP. This supersedes the original sequencing restriction for manual UI work only. Phase 0 binary research remains unverified. Do not present screenshots as parser fixtures or this local backup format as a frozen production match contract.

## Implemented

- React dashboard with one account's last recorded stars and a history chart, configurable target, per-player stats, player × hero performance, recent matches, filters and responsive layout.
- Manual add/edit with a selected player, hero name, explicit timezone-aware match time, mode, outcome, optional K/D/A and duration, optional observed stars and notes.
- Independent real/demo state. Real seed: four confirmed Gaurav games, 115 → 117, 3 wins / 1 loss, 3003 seconds. Demo seed: seven paired ranked screenshot games, 115 → 115, 3 wins / 4 losses, 5709 seconds; human assignments invented under user authorization.
- Runtime Zod checks at form/storage/JSON boundaries; immutable correction snapshots; JSON backup/restore and CSV export. Empty numeric form fields map to null, including stars. CSV strings that could trigger spreadsheet formulas are escaped.
- Configurable player entities and user-supplied canonical hero IDs. No guessed MLBB hero mappings are shipped.

## Data contract and storage

`format: mlbb-manual-tracker`, `version: 1` is an export format for this local implementation. `stateSchema` includes players, heroes, push settings, matches and audit. Unknown versions are rejected rather than rewritten. A restore is a validated replacement with explicit UI confirmation; real/demo mismatches are rejected. Local audit records have time, reason and original values but cannot prove human editor identity without login.

`StoragePort` abstracts browser localStorage. Save-before-render ordering means quota/permission failure leaves the form and old state intact. Existing malformed data is preserved for recovery. Separate storage keys isolate demo and real. Revision comparison catches most stale-tab writes; it is not a multi-writer database lock. Use one editing tab. Clearing browser storage, private browsing or changing origins can lose access; backups are essential.

This is an explicitly local first slice. A hosted deployment of these static assets alone would not create shared data. Multi-device operation requires authenticated Worker routes and PostgreSQL persistence; do not market the local tracker as synced. No secrets or raw screenshots are bundled.

## Analytics rules

- Account rank is the latest chronologically recorded ranked `starsAfter`, independent of player filter. Earlier inserts never change that latest observation. Later matches with missing state surface an incomplete warning.
- Star change is observed `after - before`, for ranked matches only. A 114 → 114 defeat contributes zero. Unknown changes do not count as zero; coverage accompanies metrics. Mixed named tiers with numeric stars are rejected; cross-tier conversion is unsupported.
- Win rate = wins / (wins + losses). Draw and unknown outcomes are excluded from the denominator. Zero decided games displays unavailable.
- Match time sums known durations and displays coverage. It is active match duration, not elapsed session time.
- Filtering order: chronological sort -> player/mode/date filters -> last N. Dates use the configured IANA timezone. Chart and account card retain all ranked matches.
- Duplicate add is blocked when a record already has the same absolute match timestamp. Native battle identity is unverified; no claim of cross-source deduplication is made.

## Remaining work

Multi-push/season database migrations, authenticated API and cross-device sync; verified tier mapping/rank events; native battle IDs and collector tokens; Android acquisition and parser fixtures. Continue these as separate milestones rather than silently converting local state into cloud writes.

Reference tooling documentation: [Vite](https://vite.dev/guide/), [React TypeScript](https://react.dev/learn/typescript), [Zod validation](https://zod.dev/basics), consulted 2026-09-12. Dependency versions are pinned in the lockfile.
