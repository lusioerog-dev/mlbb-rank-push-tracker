# Checkpoint C: match and hero identity

Status: locally complete on 14 September 2026; not deployed.

Checkpoint C adds the optional identifiers needed for reliable future imports
without requiring them for manual tracking. Existing records remain valid and
unknown values remain empty.

## Behavior

- Battle ID is optional text, so long values and leading zeros are preserved.
  The application rejects duplicates in the active season and PostgreSQL rejects
  duplicates across every season in the shared account.
- Heroes retain stable internal IDs. A verified game ID is optional and unique
  within the account; entered name and ID observations remain on each match.
  Alternate observed names become aliases of the same hero instead of creating
  another identity.
- Position played is an optional choice: EXP lane, Gold lane, Mid lane, Roam or
  Jungle. It is recorded from the match and never inferred from the hero.
- Match history displays Battle ID and position when present. JSON backups retain
  every field and CSV exports include identity, observation and position columns.

Migration `202609140004_match_identity.sql` creates the account hero registry,
adds typed identity and position columns to normalized matches, and installs
account-wide uniqueness and record-consistency constraints. It preserves the
complete match JSON and keeps inactive hero identities for historical references.
The migration is staged for the final release and has not been applied to the
production database.

## Verification

All 43 repository tests pass. They cover leading-zero preservation, stable hero
resolution through a verified ID and alias, nullable unknowns, duplicate Battle
ID rejection, typed database fields, and cross-season uniqueness. Type checks,
lint, formatting and the production build pass.

The migration was also rehearsed against the checksum-verified revision-8
production backup. It retained all three matches, the 103-star Mythical Immortal
rank, 3 wins, 0 losses and 4,889 recorded seconds while leaving legacy rows
unchanged. A local browser save confirmed that Battle ID, Benedetta, its verified
ID and Jungle render correctly in match history. No Worker, Pages or production
database change was made.
