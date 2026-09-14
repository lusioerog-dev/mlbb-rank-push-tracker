# Checkpoint B1: additive season/match schema and read API

Status: locally verified; not applied or deployed to production.

This subphase defines the future normalized storage without changing the live
source of truth. Migration `202609140002_tracker_v2.sql` adds explicit season and
match tables, a repeatable one-time backfill and a membership-protected read
function. The Worker exposes its read contract at `GET /v2/tracker`, while version
2 writes return a clear unavailable response until the cutover is ready.

## Storage behavior

- Each workspace has at most one active season. Historical season boundaries use
  the immutable rollover audit ID; active and archived IDs are deterministic.
- Every match keeps its original record plus typed identity, order, player, hero,
  time, mode, result, star-delta presence, source and timestamps. Constraints
  detect disagreement between the record and typed columns.
- A missing `starDelta` remains different from an explicit null or zero.
- Match IDs, chronological positions and played times are unique within a season.
- Backfill reads legacy state without updating it. A second backfill stops with
  `ALREADY_BACKFILLED`, preventing accidental duplicate or partial remapping.
- The active version-2 response is reconstructed from season metadata and ordered
  match records, then validated by the shared application schema in the Worker.
- Direct anonymous or authenticated table/function access is denied. The Worker
  still verifies the signed-in user and workspace membership first, and the SQL
  load function repeats the membership check.

The schema stores complete validated match JSON during transition so every field
can be compared and rolled back. Later checkpoints may promote more fields to
typed columns while retaining the original observations.

## Verification

An isolated PostgreSQL test restores a tracker containing four archived matches
and an empty active season, applies the existing and new schemas, and runs the
backfill. It verifies stable IDs, exact active-state reconstruction, unchanged
legacy rows, access denial, retry refusal and row counts. API tests verify the
canonical version-2 response and that writes remain unavailable.

The same migration and read path were also rehearsed against the private,
checksum-verified revision-8 production backup. It produced one active season
with three matches, reconstructed revision 8 exactly, and retained Mythical
Immortal at 103 stars, 3 wins, 0 losses and the recorded 4,889 seconds of play.

All 42 repository tests, type checks, lint, formatting and diff checks passed.
No production database objects, Worker, Pages deployment or user records changed.

## B2 cutover work

B2 must add and test the transactional version-2 save path, including normal
edits, deletion, concurrent-save conflicts and season rollover. It must reject
old-client writes after activation and update the web client to `/v2/tracker`.
Before applying anything live, capture a fresh checksum-verified backup, run the
backfill in one transaction and compare current and normalized match fields,
revision, rank and statistics. Deploy the Worker and web client together only
after those comparisons pass. Keep the legacy snapshot and history for recovery.
