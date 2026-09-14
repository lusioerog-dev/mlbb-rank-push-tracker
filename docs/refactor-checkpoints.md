# Private tracker refactor checkpoints

Further development follows the [short architecture plan](architecture-plan.md).
Its checkpoints A–F replace the deferred order below; the older list remains as
scope history. Checkpoint A is complete: [backup and rehearsal evidence](backup-rehearsal.md).
Checkpoint B is complete: [B1 added the normalized read model](checkpoint-b1.md)
and [B2 completed transactional saves and the production cutover](checkpoint-b2.md).
[Checkpoint C](checkpoint-c.md) and [checkpoint D](checkpoint-d.md) are complete
locally. The next checkpoint is E: focused UI and performance improvements. Per
the updated release plan, checkpoints C–F remain local and deploy together after
final QA and review.

## Phase protocol

The user reprioritized on 14 September: deliver a usable season-launch release
as soon as possible with limited usage. The next checkpoint is one bounded
release phase: season archival, essential UI cleanup, verification and deployment.
This supersedes the original order below. Test, inspect the diff, checkpoint,
report, and stop after the release; do not begin deferred work automatically.

## Season-launch release (deployed)

Released as `81146f4`. Worker and Pages deployment and signed-in reads were
verified. No production database migration ran. The planned verified local
production backup and mobile check were not established in the release log;
do not treat them as completed prerequisites for a future data migration.

- Reuse the working private tracker, authentication and shared saves.
- Archive a season inside existing correction history before clearing the active
  match log. Keep original match IDs, heroes and all prior corrections. Show past
  season records in Settings and include them in full JSON backups.
- Enter the actual new starting rank; never guess the season reset. Protect the
  baseline after matches exist, allowing an explicit correction with a reason.
- Simplify Overview, keep filters in match/hero views, focus new entry on Ranked,
  and keep actual star changes including zero for protection.
- Verify season preservation, stale saves, build and mobile/desktop rendering.
- Deploy the Worker and Pages app after a verified production snapshot backup.
  No production database migration or row deletion is needed for this release.

Deferred: Battle ID/importer foundation, official artwork, lane analytics,
rank-aware target redesign, full placement workflow and further visual polish.
The current optional target is explicitly a season star balance, not a rank target.
Full refactor completion is not required for this launch.

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
The original next phase was Phase 2; the season-launch release above now takes priority.

## Deferred original phases (each requires its own continue)

2. Canonical match and automation foundation, Battle ID and database deduplication.
3. Minimal verified MLBB hero mapping and official base portraits.
4. Rank-aware seasons, targets, placement, protected baselines and corrections.
5. Overview hierarchy and rank presentation.
6. Ranked recording and expandable match log.
7. Hero Performance and All/Gaurav/Rupesh scopes.
8. Match-based Lane Performance.
9. Automation readiness review, without implementing the full importer.
10. Final cleanup and QA, including real-data preservation verification.
