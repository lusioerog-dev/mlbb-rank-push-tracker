# MLBB Rank Push Tracker

Refactor checkpoint: **Phase 1b (private shared-push cleanup)**. Demo/Real mode, generic workspace creation/joining, invitations and editable player controls are removed in the local code. See [current private-push setup and rollout](docs/private-push.md) and [phase checkpoints](docs/refactor-checkpoints.md). Changes are committed locally; production deployment is separate.

Live website: [Push Together](https://mlbb-rank-push-tracker.pages.dev/). Hosted on Cloudflare Pages with Supabase sign-in and a Cloudflare Worker for shared storage. Personal browser storage remains available separately.

The shared backend uses Supabase sign-in, Worker validation, and PostgreSQL revision/audit storage. The new UI opens the configured shared push directly after sign-in. See [backend setup and verification](docs/backend.md), [rank rules and season setup](docs/rank-rules.md), and [the feature change report](docs/2026-09-13-update.md).

A shared-account rank tracker for Rupesh and Gaurav, with fixed user-facing names. The **local manual-entry MVP** supports recording matches, reviewing account stars, comparing players, hero performance, and data export/restore.

## Run locally

Requires Node.js 24 and npm. No Android Studio, Docker or cloud account is required.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. For an isolated local preview, use a null backend config with the development server only; production requires valid shared-backend configuration. Production API CORS is restricted to the live website. Personal mode saves only in that browser and origin; shared mode on the live site saves to Supabase. Export backups regularly.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

The static dashboard build is in `dist/web`; collector compilation remains in `dist/src` and `dist/tests`. `npm run inspect -- <file>` still runs the Phase 0 research inspector. `npm run dev` now starts the dashboard server rather than printing inspector help.

## First use

1. The real tracker contains four screenshot-reviewed matches, all attributed to Gaurav as confirmed by the user. The shared account moved from 115 to 117 stars.
2. Select the season's actual starting rank/division/stars, timezone in Settings. The target remains optional. Reset ranks are not guessed.
3. Choose **Record match**, select who played, and enter the actual star change. A protected loss can have zero change. Before/after observations remain optional for compatibility; empty values stay unknown. Rank is derived without typing a rank for each match.
4. Enter a hero name when known; it becomes a reusable hero entity. Screenshot hero names await user confirmation.
5. Use the match row's edit button to correct a record. A reason is required; the original record is retained in correction history and JSON backups.

Filters apply to match/player/hero statistics. The shared account card and progression chart always use all recorded ranked matches. Win rate is wins divided by wins + losses, excluding draws and unknown outcomes. Coverage labels explain missing stars/durations. Total net stars is unknown when any selected game lacks a change. Current rank means latest recorded account state, not a live reading from MLBB.

## Data and limitations

- Browser storage is a temporary local adapter behind `StoragePort`. No database credentials, API, login, background sync or FightHistory decoding is implemented.
- One active push per stored snapshot in this version. Existing shared seasons remain separate workspaces until the season refactor. See the rank-rules documentation for supported transitions and placement limits.
- The seed's 09/12 times come from screenshots. The 2026 year and Nepal UTC offset are contextual assumptions, stated in every seed note and editable. Screenshot capture times are not used as match times.
- The private screenshot review remains preserved. Its old demo assignments are no longer included in the application.
- Add guards reject same-time duplicate entries for this one-account workflow. JSON restore is replacement, not merge, so repeat restore cannot accumulate duplicates. Cross-source battle identity is still a Phase 0 research task.
- Use one editing tab at a time. Revision checks catch stale saves, but browser storage has no database transaction guarantees. Local corrections have no authenticated editor identity.
- JSON backups retain the whole tracker, including audit records; CSV exports match rows only and escapes formula-leading strings. Raw screenshots remain Git-ignored in `research-private/`.

## Architecture

```text
Current: manual form -> Zod validation -> tracker domain -> local storage
                                      -> analytics -> React dashboard

Future: read-only source -> verified parser -> normalizer -> versioned match
        -> authenticated Worker API -> Supabase PostgreSQL -> dashboard
```

`apps/web` contains React/TypeScript/Vite/Tailwind/Recharts UI. `packages/tracker` owns the experimental manual data format, validation, analytics, seed, time conversion and storage adapter. `collector` remains isolated from the dashboard. Phase 0B is **not complete**: screenshot evidence does not validate the binary format. The user authorized manual entry while that research is deferred; the manual backup format does not freeze a production FightHistory contract.

See [architecture](docs/architecture.md), [manual MVP design](docs/manual-mvp.md), [research checklist](docs/fight-history-research.md), [field ledger](docs/data-field-validation.md), [collector instructions](collector/README.md), and [fixture policy](collector/fixtures/README.md).

## Cloud and environment configuration

`.env.example` lists future server-only values. The manual MVP does not need or read them. Never expose a Supabase service-role key using a `VITE_` variable. The frontend is deployed on Cloudflare Pages using direct upload; Git pushes do not automatically publish website updates. See [deployment instructions](docs/deployment.md). Worker API and Supabase PostgreSQL integration remain planned, with local/development/production isolation and tracked migrations. No Azure resources are used.

## Troubleshooting

- Blank page: check the terminal, use Node 24, and run `npm ci` followed by `npm run dev`.
- Port 5173 busy: stop the other process you own; do not silently change ports because browser storage is origin-specific.
- Save failure: keep the form open, free browser storage or reload after checking another tab, then retry. Failed writes do not show a success message.
- Unreadable saved data is not silently reset. Use the recovery download, preserve it, and ask for repair.
- Wrong numbers: check filters, blank fields and recorded times. Edit the affected match; do not change later star observations to fabricate a continuous sequence.
- The research inspector returning `NO_VERIFIED_PARSER` is expected. It hashes local copies only and exits 2; it cannot import a match.

CI runs typechecking, lint, formatting, regression tests, and the build. Tests cover shared stars, zero changes, unknown data, chronology, corrections, duplicate guards, backup validation, legacy-data compatibility and demo-backup rejection, storage failures and timezone conversion, plus the original inspector tests.
