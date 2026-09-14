# Checkpoint B2: transactional saves and production cutover

Status: deployed and verified on 14 September 2026.

Checkpoint B2 makes explicit season and match records the application's live
read/write model. Migration `202609140003_tracker_v2_writes.sql` adds an atomic,
revision-checked save function and keeps the legacy save function as a temporary
adapter so the already deployed client remained safe during the cutover.

## Save behavior

- The Worker and web client read and write the canonical version-2 contract at
  `/v2/tracker`.
- A save locks the active season, rejects stale revisions, validates membership
  and state shape, then updates season metadata and replaces that season's match
  rows in one transaction.
- A rollover verifies the submitted archive against the current normalized
  season, archives it and creates the next active season atomically.
- Every successful save also updates the legacy snapshot and appends the legacy
  history row. These records remain available for recovery.
- Legacy reads remain available during rollout. Legacy writes now receive an
  upgrade response from the Worker; the database adapter keeps an old Worker safe
  if deployment rollback is needed.

## Production evidence

Immediately before migration, the revision-8 export matched the verified local
backup: PostgreSQL JSON MD5 `ca9bea153aa4fc134d5e07ff0587c5e9` and backup
SHA-256 `40c0fbb59570bf0ad8f26536a86572a8f411068bce6524a81ae997fd3fa532d8`.
The additive backfill created one active season and three match rows.

After both migrations were applied, a real call to `tracker_save_v2` returned
revision 9 inside an explicit transaction that was rolled back. A final read-only
comparison then confirmed revision 8, one season, one active season, three
matches, nine legacy history snapshots and an exact version-2 reconstruction of
the legacy state. No production match, rank, statistic or history value changed.
A malformed SQL-editor attempt failed before making changes; the subsequent
migration and every comparison completed successfully.

The Cloudflare Worker deployed as version
`4d829159-fa1b-4a35-a22c-34f80fb0ae88`. Cloudflare Pages deployed from the same
build at `https://7108377a.mlbb-rank-push-tracker.pages.dev`, with the stable site
remaining `https://mlbb-rank-push-tracker.pages.dev`.

## Verification

The isolated PostgreSQL rehearsal covered a normal save, stale conflict, legacy
adapter save and rollover with an existing archived season. The production-backup
rehearsal covered the same operations and preserved the original rank and
statistics. All 42 repository tests, type checks, lint, formatting and production
build passed before cutover.

After deployment, the signed-in stable site loaded the existing Mythical Immortal
103-star season, both players and all three matches through the version-2 API.
The browser console reported no errors. The transactional write was deliberately
rolled back, so verification did not create a fake activity or correction entry.

The next checkpoint is C. It can add Battle ID, stable hero identity and the
position actually played without changing the completed storage boundary.
