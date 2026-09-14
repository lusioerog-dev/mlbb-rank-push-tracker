# Checkpoint A: backup and local conversion rehearsal

Captured on 14 September 2026, from the signed-in Supabase SQL editor using
read-only SELECT statements. Production continued receiving user saves during
the work; the verified snapshot is revision 8, with its final save at
2026-09-14T14:00:55.162926Z. It is a point-in-time backup, not a live mirror.

## Verified backup

- Private file: `research-private/backup-2026-09-14-rev8.json` (ignored by Git).
- PostgreSQL JSON checksum (MD5): `ca9bea153aa4fc134d5e07ff0587c5e9`.
- Exact file SHA-256: `40c0fbb59570bf0ad8f26536a86572a8f411068bce6524a81ae997fd3fa532d8`.
- Contents: one workspace, two membership records, three active matches, nine
  complete server snapshots (revisions 0–8), settings, heroes and corrections.
- No archived seasons exist in this production snapshot.

The data and PostgreSQL checksum came from the same query result. The saved file
was then parsed in local PostgreSQL, and its JSON checksum matched the source.
An earlier revision-5 capture is also retained privately, but revision 8 is the
verified recovery artifact. No production rows were changed by this checkpoint.

This is an application-data backup of `tracker_workspaces`, `tracker_members`
and `tracker_history`, not a full Supabase project dump. It excludes Auth
credentials, retired invitations, service secrets and hosting configuration.
The local restore uses placeholder Auth IDs solely to satisfy foreign keys;
it does not reproduce login accounts or prove a disaster-recovery login flow.

## Repeat the local check

Run from the repository root:

```powershell
npx tsx scripts/backup-rehearsal.ts research-private/backup-2026-09-14-rev8.json ca9bea153aa4fc134d5e07ff0587c5e9
```

The tool accepts a local file and expected source checksum. It creates only an
in-memory PGlite database, takes no connection URL, and closes it on completion.
It restores the original application tables using the existing schema, compares
all rows including nested JSON and timestamp microseconds, checks contiguous
history and verifies that its latest state equals the current snapshot.

The conversion prototype then separates seasons and ordered match records in a
local `rehearsal` schema and reconstructs their complete canonical states.
Match fields, players, heroes, settings, corrections, rank and statistics must
compare exactly. Archived seasons derive IDs from their original audit IDs;
the active season maps from the last archive boundary. Malformed archives and
duplicate archive IDs stop conversion rather than silently omitting records.

These tables retain match payloads as JSON for preservation testing. They are
not the final normalized production schema, API cutover, or an executable live
migration. Final typed columns and stable boundary mappings must be completed
and verified in checkpoint B. Legacy history remains intact for recovery.

## Rehearsal results and next step

The real backup restored and converted successfully: three matches, 103 stars,
Mythical Immortal, two members and nine snapshots. Separate fixture tests cover
archived matches, an empty new season, missing history and malformed archives.
All 40 repository tests, type checks, lint, changed-file formatting and diff
checks passed. No frontend rebuild or deployment was needed for this local tool.

Before checkpoint B cuts over storage, capture a fresh backup with
`scripts/export-backup.sql`, repeat this check, and reconcile any new records.
Keep this private backup available outside Git; copying it to a second trusted
storage location is still outstanding. Existing authentication must remain in
place when restoring these application tables.
