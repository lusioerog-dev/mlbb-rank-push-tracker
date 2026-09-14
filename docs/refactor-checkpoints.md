# Private tracker refactor checkpoints

## Phase protocol

One explicit `continue` authorizes one phase or subphase. Test, inspect the diff,
checkpoint, report, and stop after each. Inspect Git status, diff, and recent
commits before resuming interrupted work. Do not run later phases automatically.

## Phase 1a: remove the Demo/Real system

Starting checkpoint: `ce058a2` (clean `master`). This is a code checkpoint, not a
backup of production database or browser records.

The application now has one canonical state (format version 2), with no dataset
field, demo seed, dataset selector, or demo rendering branch. The four existing
screenshot-reviewed matches retain their original IDs, attribution, observations,
notes, and timestamps. No real matches or historical database snapshots are deleted.

`packages/tracker/compatibility.ts` is the only production compatibility boundary
that understands the old dataset discriminator. It reads version-1 real snapshots
and rejects demo snapshots, malformed records, and unsupported versions. JSON
backups use version 2 and require this build or newer to restore; older real-data
backups remain readable. The existing browser key and API/database wire format stay
at version 1 with the fixed legacy discriminator, so deployed clients remain
compatible during the phased rollout. Loading never rewrites storage. This is a
serialization adapter, not a supported second tracker mode.

Old demo browser storage is left untouched and is never loaded by the application.
No database migration or production deployment is part of this checkpoint.

Checks passed: 33 tracker/collector/API tests including legacy rejection, full-data
round trips, stale writes, API compatibility and isolated PostgreSQL migration
checks; typecheck, lint, formatting and build. Local browser verification confirmed
the dashboard and match form render without the selector or console errors. The
build reports a large JavaScript chunk warning; bundle splitting is outside this
subphase. Production authentication and live database contents remain unverified.

## Phase 1b: private shared-push cleanup

Starting checkpoint: `8a2d495`, clean branch `codex/phase-1a-remove-demo`.
Read-only live SQL verified one workspace, two members, two matches and five
history snapshots. The expected player IDs are present. See [inventory, changes,
checks and rollout](private-push.md) for details and the verified workspace UUID.

Removed generic creation/join/invite APIs and controls, workspace selection,
public signup, personal/shared switching, and player-editing controls. Preserved
membership authorization, audit history, old-client read/save compatibility and
browser backup recovery. A tested migration retires creation/join functions and
invite access without deleting rows. No production deployment or migration was
performed. A fresh verified local data backup is required before live migration.

36 tests, typechecking, lint, formatting, build, and local Settings checks passed.
The next phase is Phase 2, the canonical match/automation foundation. Do not begin
it without a new explicit continue.

## Later phases (each requires its own continue)

2. Canonical match and automation foundation, Battle ID and database deduplication.
3. Minimal verified MLBB hero mapping and official base portraits.
4. Rank-aware seasons, targets, placement, protected baselines and corrections.
5. Overview hierarchy and rank presentation.
6. Ranked recording and expandable match log.
7. Hero Performance and All/Gaurav/Rupesh scopes.
8. Match-based Lane Performance.
9. Automation readiness review, without implementing the full importer.
10. Final cleanup and QA, including real-data preservation verification.
