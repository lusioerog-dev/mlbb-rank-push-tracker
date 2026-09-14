# Checkpoint D: rank checkpoints, placement and targets

Status: locally complete on 14 September 2026; not deployed.

Checkpoint D makes rank uncertainty and goals explicit. The tracker still uses
actual star changes and stops derivation at an unknown boundary. A confirmed
checkpoint can resume the rank calculation without rewriting earlier evidence.

## Behavior

- A checkpoint records tier, division, stars, rules version, confirmation time,
  reason and whether it came from placement, observation or a correction. It
  belongs to a specific match boundary.
- Promotion from Legend into unverified Mythic placement shows `pending` until a
  placement checkpoint is recorded. Later star changes do not silently clear it.
- Correcting a checkpoint retains the original match in correction history and
  recalculates every later rank from the corrected value.
- Targets identify tier, division and stars. Progress and remaining stars compare
  ranked positions across the configured ladder.
- An old numeric target becomes a Mythic target only when the starting rank is
  Mythic; ambiguous lower-rank values are not guessed.

Migration `202609140005_rank_checkpoints.sql` creates normalized rank-target and
match-checkpoint records with typed constraints and restricted access. Save
triggers update them in the same transaction as season metadata and matches. The
migration maps an unambiguous legacy Mythic target without changing workspace
JSON.

## Verification

Tests cover pending and confirmed placement, checkpoints after unknown gaps,
checkpoint corrections, later-rank recalculation, cross-tier target progress,
invalid targets, legacy checkpoint compatibility and database normalization. The
database test applies the migration after the already backfilled B2 schema,
matching the final production order.

The checksum-verified revision-8 production backup retained its three matches,
103-star Mythical Immortal rank, 3 wins, 0 losses, 4,889 recorded seconds and all
legacy rows. Its existing 105-star Mythic milestone produced one normalized rank
target and no invented checkpoints.

A local browser check set a 125-star Mythic target, displayed 7 remaining rank
stars, and verified the checkpoint tier, stars, type and confirmation-reason
controls. The browser reported no errors. Tests, type checks, lint, formatting
and the production build passed. No Worker, Pages or production database change
was made.
