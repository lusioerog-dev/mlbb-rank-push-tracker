# Maintenance guide

Reviewed 15 September 2026. Use this checklist for routine tracker maintenance;
deployment-specific ordering remains in [deployment](deployment.md).

## Before every change

- Export a JSON backup before database, rank-rule, catalog or season work.
- Keep the fixed two-player, one-account, Ranked-only domain unless a new scope is
  explicitly authorized.
- Preserve Battle IDs as text, match positions as observations, exact hero
  observations, actual star deltas and correction history.
- Never infer missing rank, result, duration, hero ID or position data.
- Run changes against local fixtures or an isolated Supabase project, not live
  production records.

## Rank rules

Rank logic belongs in `packages/tracker/rank-rules.ts`; UI components consume the
shared display adapter. When MLBB changes ranks or a season reset:

1. Prefer stable first-party sources and record their review date.
2. Update the rules version and boundary tests together.
3. Keep secondary reset tables dated and confirmation-required.
4. Leave placement/demotion outcomes unknown unless verified.
5. Confirm old backups still load without rewriting historical observations.

See [rank rules](rank-rules.md) for current evidence and limits.

## Hero catalog

`packages/tracker/heroes.ts` is the only global ID/name/portrait catalog. Refresh
it when a hero is added or base art changes. Validate unique numeric IDs and
names, HTTPS Moonton CDN URLs, current known IDs and fallback behavior. Do not
guess portraits from typed names or add global portrait URLs to workspace rows.
See [hero metadata](hero-metadata.md) for attribution and the refresh procedure.

## Database and Realtime

- Add forward-only, ordered SQL migrations; never edit a migration already
  applied to production.
- Rehearse migrations with embedded PostgreSQL and verify record counts, exact
  fields, constraints, grants and history preservation.
- Keep browser writes revoked. The Realtime SELECT policy must remain scoped
  through `tracker_members`.
- Treat Realtime payloads only as invalidation signals and retain Worker refetch
  as the canonical read path.
- Any subscription change requires two-session insert/update/delete, draft safety,
  cleanup and visibility/focus recovery tests.

## Backups and recovery

JSON export is the portable application backup; CSV is analytics-only and cannot
restore the tracker. A restore replaces the current state and is retained in
audit/history. Verify a backup by loading it through the compatibility validator
and comparing players, heroes, seasons, matches, revision and corrections.

Never silently reset unreadable data. Preserve the file and error, then repair or
migrate it explicitly. Never overwrite newer production records with an older
snapshot after post-release writes.

## Routine verification

Run typecheck, lint, all tests, production build, formatting and `git diff
--check`. Manually inspect desktop and phone layouts after presentation changes.
For Auth/Worker/database changes, test signed-out denial, both members, an
unrelated user, conflict handling and secret redaction. Current results and the
outstanding live release gate are in [the Phase 7 report](phase-7-test-report.md).
