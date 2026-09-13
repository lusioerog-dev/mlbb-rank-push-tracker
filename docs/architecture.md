# Architecture decisions — Phase 0A

**Update 2026-09-13:** The user authorized connecting the manual tracker to a shared backend. [Backend design](backend.md) describes the Worker, Auth, versioned PostgreSQL snapshots, transactional concurrency and deployment requirements. This authorization covers manual-data storage; FightHistory parsing is still deferred.

**Update 2026-09-12:** The user approved a local manual-entry MVP while FightHistory research is deferred. See [manual MVP](manual-mvp.md) for the implemented architecture and scope. The original phase gate below continues to apply to production FightHistory parsing/schema, not the newly authorized manual UI. No binary fields have been verified.

## Scope and phase gate

Use one private npm package while only research tooling exists. Split into apps and shared packages when API/frontend consumers exist. Strict TypeScript with Node's test runner through tsx keeps the research environment small. Do not create speculative production migrations or a full dashboard.

Phase 0B must deliver reproducible decoding and a per-field evidence ledger using 10–20 real samples. Phase 0C freezes only supported fields into a runtime-validated contract, with unknown values omitted rather than manufactured. Optional unsupported fields stay unavailable. Contract evolution and parser versioning are independent.

## Replaceable boundaries

`FightHistorySource` delivers bytes; manual copies are the first research path. Future SAF, ADB and Shizuku adapters must not affect parsing. `FightHistoryParser` identifies supported formats and produces observations plus warnings. The later normalizer maps supported observations into the application-owned contract. Raw offsets, binary types and upstream classes never enter API or analytics contracts.

All sources (FightHistory, manual, future API or screenshots) eventually use that one contract. Reference implementations may inform decoding after revision/license review, but are not runtime dependencies. Parser uncertainty must stop ingestion.

## Identity and correctness

The shared game account is distinct from human players. Random installation IDs identify collectors without hardware identifiers. Store default/active player mappings and capture attribution at discovery with its effective time. A queued historical file must not inherit today's mapping; unknown historical attribution needs review. Local presence alone must be tested: history might sync across devices. Store original attribution plus audited corrections.

Raw SHA-256 identifies repeated bytes, not necessarily the same battle. Prefer a validated account-scoped battle ID for match uniqueness. If unavailable, evaluate a deterministic fingerprint with collision review; never silently merge ambiguous matches. Later database uniqueness and transactional imports must enforce idempotency even under concurrent uploads.

Rank is account/push history, not a mutable per-human field. Preserve original tier/stars, timestamps and provenance in rank events. Never infer exact change solely from win/loss. Seasons and pushes retain past matches. Hero IDs map through canonical data entities, not component constants.

## Reliability, security, and portability

Later pipeline: discovered -> parsed -> validated -> normalized -> deduplicated -> uploaded -> stored. Durable local queue, bounded retry/backoff and server acknowledgements handle outages; unknown formats remain quarantined with diagnostics and original hashes. Parser version, schema version, source/import times, status and corrections are retained for reprocessing.

API authenticates device-specific revocable tokens and dashboard users, validates payloads, and owns privileged writes. Secrets stay server-side. PostgreSQL remains canonical with migrations and JSON/CSV export; raw archives remain private and configurable. Keep API domain logic separate from Worker handlers and analytics separate from React. Use explicit configurable timezone and unknown-value coverage in analytics. No distributed infrastructure is needed.

Cloud resources, authentication details, database tables and pricing verification are later-phase work. This phase incurs no hosting cost.
