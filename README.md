# MLBB Rank Push Tracker

A personal ranked-push tracker for people sharing one MLBB account. Players will be database entities; devices provide attribution evidence, with a changeable active player.

## Current status: Phase 0A

This repository contains a local research harness and the evidence plan. **No real FightHistory samples have been validated. No match parser, frozen match schema, database, API, or dashboard exists yet.** Synthetic tests check the harness only.

## Local development

Requires Node.js 24 LTS and npm. From the repository root:

```sh
npm install
npm run dev
npm run inspect -- "collector/fixtures/private/sample-001.bin"
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

`dev` prints research-tool usage, not a web server. Inspection emits only size, SHA-256, tool/report versions, timestamp and diagnostics. Exit 2 means metadata was inspected but no match was parsed; exit 1 means an input/usage failure. No network or cloud credentials are used. Use `npm ci` for reproducible installs after cloning.

## Architecture and roadmap

```text
Read-only device/file source -> isolated parser -> normalizer
 -> versioned match contract -> Worker API -> PostgreSQL -> analytics -> React
```

Manual entry and future ingestion adapters will share the same contract. Planned stack: React/TypeScript/Vite/Tailwind, Cloudflare Pages and Workers, Supabase PostgreSQL. Target operating cost is $0 for personal use; free-tier limits must be checked at deployment. No Azure resources are needed.

Phase 0B validates 10–20 real files against screens. Phase 0C then introduces a tested Zod contract. Only afterward: database migrations, authenticated API, manual import, dashboard, collector, automatic sync, advanced analytics.

## Documentation

- [Architecture](docs/architecture.md)
- [Research and sample collection](docs/fight-history-research.md)
- [Field validation ledger](docs/data-field-validation.md)
- [Format investigation](docs/fight-history-format.md)
- [Collector tooling](collector/README.md)
- [Fixture policy](collector/fixtures/README.md)

## Configuration, database, and deployment

`.env.example` documents future configuration. Phase 0 does not load it. `APP_TIMEZONE` defaults conceptually to `Asia/Kathmandu`; timestamps must retain their original timezone evidence. Supabase service credentials and collector secrets are server-only and must never use a browser-exposed `VITE_` prefix.

Database/Supabase setup and Cloudflare deployment are deliberately deferred until data validation. There are no migrations or deploy commands yet. Later development uses local PostgreSQL/Supabase isolated from production, tracked migrations, revocable collector credentials, and authenticated mutations. Deployment documentation will be added with working deployment configuration.

## Tests and troubleshooting

Tests exercise hashes, byte views, unknown/empty/oversized inputs, local reads and repeat inspection. They make no assertion about MLBB fields. CI checks formatting, types, lint, tests and build.

- `NO_VERIFIED_PARSER` is expected until Phase 0B; do not import this report as a match.
- File errors: use a regular readable local copy under 16 MiB. This size cap is a research limit, not an MLBB format fact.
- Android access failure: record phone/Android/game versions and attempted method; see research notes. Do not change game files.
- Keep originals, screenshots, local outputs and identity mappings in ignored private folders. Git ignore is an accident-prevention measure, not encryption. Review staged files before every commit.

Next: collect paired samples and screens following the research checklist, then establish format evidence and golden tests.
