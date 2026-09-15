# MLBB Rank Push Tracker

Release status: **checkpoints A–E are live; the account/realtime/rank/portrait redesign is committed but not deployed**. Production remains on the 15 September focused release until the pending Realtime migration, ordered deployment and two-session release gate are explicitly authorized. See [deployment](docs/deployment.md), [the Phase 7 test report](docs/phase-7-test-report.md) and [implementation status](docs/IMPLEMENTATION_STATUS.md).

Live website: [Push Together](https://mlbb-rank-push-tracker.pages.dev/). Hosted on Cloudflare Pages with Supabase sign-in and a Cloudflare Worker for shared storage. Personal browser storage remains available separately.

The shared backend uses Supabase sign-in, Worker validation, normalized PostgreSQL records, revision/audit snapshots and member-scoped Realtime invalidation. The UI opens the configured push directly after sign-in and keeps account controls on a dedicated Account page. See [backend](docs/backend.md), [architecture](docs/architecture.md), [rank rules](docs/rank-rules.md), [hero metadata](docs/hero-metadata.md) and [maintenance](docs/maintenance.md).

A shared-account rank tracker for Rupesh and Gaurav, with fixed user-facing names. The manual-entry release supports recording matches, reviewing account stars, comparing players, hero and lane performance, season rollover, and data export/restore.

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

1. Sign in with one of the two provisioned member accounts; unrelated users cannot open the private push.
2. Select the season's confirmed starting rank/division/stars and timezone in Settings. The target remains optional. Reset suggestions are never automatic.
3. Choose **Record Ranked**, select who played, and enter the actual star change. A protected loss can have zero change. Empty values stay unknown; use a confirmed checkpoint when placement or another boundary cannot be derived safely.
4. Enter the hero name and numeric ID only when known. Confirmed IDs resolve canonical names and base portraits; unknown IDs remain preserved with a safe fallback.
5. Use the match row's edit button to correct a record. A reason is required; the original record is retained in correction history and JSON backups.

Filters apply to match/player/hero statistics. The shared account card and progression chart always use all recorded ranked matches. Win rate is wins divided by wins + losses, excluding draws and unknown outcomes. Coverage labels explain missing stars/durations. Total net stars is unknown when any selected game lacks a change. Current rank means latest recorded account state, not a live reading from MLBB.

## Data and limitations

- Production uses Supabase sign-in, a Cloudflare Worker and PostgreSQL. Browser storage remains a local development and recovery adapter behind `StoragePort`. FightHistory decoding is not implemented.
- One fixed private push has one active normalized season; rollover archives the previous season atomically. See the rank-rules documentation for supported transitions and placement limits.
- The seed's 09/12 times come from screenshots. The 2026 year and Nepal UTC offset are contextual assumptions, stated in every seed note and editable. Screenshot capture times are not used as match times.
- The private screenshot review remains preserved. Its old demo assignments are no longer included in the application.
- Add guards reject same-time duplicate entries for this one-account workflow. JSON restore is replacement, not merge, so repeat restore cannot accumulate duplicates. Cross-source battle identity is still a Phase 0 research task.
- Revision checks catch stale saves. Realtime changes refetch canonical state and are deferred while a Ranked form or Settings draft is open. Browser-local mode has no database transaction or authenticated-editor guarantees.
- JSON backups retain the whole tracker, including audit records; CSV exports match rows only and escapes formula-leading strings. Raw screenshots remain Git-ignored in `research-private/`.

## Architecture

```text
Current: manual form -> Zod validation -> tracker domain -> Worker API
                                      -> normalized PostgreSQL + audit snapshot
         Realtime match event -> canonical Worker refetch -> React dashboard

Future: read-only source -> verified parser -> normalizer -> versioned match
        -> authenticated Worker API -> Supabase PostgreSQL -> dashboard
```

`apps/web` contains React/TypeScript/Vite/Tailwind/Recharts UI. `packages/tracker` owns the experimental manual data format, validation, analytics, seed, time conversion and storage adapter. `collector` remains isolated from the dashboard. Phase 0B is **not complete**: screenshot evidence does not validate the binary format. The user authorized manual entry while that research is deferred; the manual backup format does not freeze a production FightHistory contract.

See [architecture](docs/architecture.md), [manual MVP design](docs/manual-mvp.md), [research checklist](docs/fight-history-research.md), [field ledger](docs/data-field-validation.md), [collector instructions](collector/README.md), and [fixture policy](collector/fixtures/README.md).

## Cloud and environment configuration

`.env.example` documents the local and deployment configuration. Never expose a Supabase service-role key using a `VITE_` variable. The frontend is deployed on Cloudflare Pages using direct upload; Git pushes do not automatically publish website updates. The Worker API uses Supabase authentication and PostgreSQL through tracked migrations. See [deployment instructions](docs/deployment.md). No Azure resources are used.

## Troubleshooting

- Blank page: check the terminal, use Node 24, and run `npm ci` followed by `npm run dev`.
- Port 5173 busy: stop the other process you own; do not silently change ports because browser storage is origin-specific.
- Save failure: keep the form open, free browser storage or reload after checking another tab, then retry. Failed writes do not show a success message.
- Unreadable saved data is not silently reset. Use the recovery download, preserve it, and ask for repair.
- Wrong numbers: check filters, blank fields and recorded times. Edit the affected match; do not change later star observations to fabricate a continuous sequence.
- The research inspector returning `NO_VERIFIED_PARSER` is expected. It hashes local copies only and exits 2; it cannot import a match.

CI runs typechecking, lint, formatting, regression tests, and the build. The current 52-test suite covers domain behavior, rank boundaries, hero identity, compatibility, database migrations/constraints, authorization, concurrency, error redaction and the original inspector. Responsive and signed-out browser results plus the remaining live two-session Realtime gate are recorded in [the Phase 7 report](docs/phase-7-test-report.md).
