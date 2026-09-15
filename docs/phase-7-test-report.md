# Phase 7 test report

Date: 15 September 2026 (Asia/Kathmandu)  
Tested commit: `a28ba43` (`phase 6: integrate and polish tracker`)

## Result

Phase 7 passed all checks that can run safely in the current local environment.
The production release remains gated on the live two-session Realtime check
described below; no production configuration, authentication session, database
record or deployment was changed during this phase.

## Automated verification

| Check                  | Result      | Coverage                                                              |
| ---------------------- | ----------- | --------------------------------------------------------------------- |
| `npm run typecheck`    | Pass        | Shared packages, Worker and React application                         |
| `npm run lint`         | Pass        | Entire repository                                                     |
| `npm test`             | Pass, 52/52 | Domain, collector, API, PostgreSQL rehearsal and migration assertions |
| `npm run build`        | Pass        | Production Vite bundle                                                |
| `npm run format:check` | Pass        | Entire repository                                                     |

The build retains the known warning for a minified JavaScript chunk larger than
500 kB. It does not fail the build.

The automated suite verifies unauthenticated and unauthorized rejection,
workspace membership, origin restrictions, revision conflicts, atomic saves,
audit retention, migration backfill, Realtime row visibility policy, Battle ID
and hero identity, rank thresholds and uncertainty, season rollover, backup
compatibility, contribution and performance aggregation, timezone behavior and
CSV formula escaping.

## Manual browser verification

The application was exercised from the local Vite preview using existing local
fixture data. No Save, Restore, Sign in, Sign out, export or remote write action
was submitted.

### Desktop — 1440 × 900

- Overview: derived Mythical Immortal position, continuous star count, target
  progress, summary cards, account graph, player contribution and recent matches
  render with the intended hierarchy.
- Match History: player/period/date filters, match rows, canonical Benedetta
  portrait, unknown-hero fallbacks, positions, KDA, duration and star deltas fit.
- Record Ranked: fixed two-player choice, Ranked-only wording, Battle ID, hero ID,
  position, result, performance, actual star delta, checkpoint and notes fields
  are present. The form was closed without saving.
- Hero Performance and Lane Performance: selected-player controls, totals,
  canonical portrait and empty-position state render correctly.
- Settings: current-season editing, target, confirmed starting-rank correction,
  backup/history and correction record sections render without overlap.

### Phone — 390 × 844

- Overview, Match History and Settings have no document-level horizontal overflow.
- The five local-mode destinations fit the fixed bottom navigation. The sixth
  Account destination was previously verified with the authenticated fixture in
  Phase 2 and remains conditional on a cloud session.
- The rank card, summary cards, graph, contribution rows, filters, match list,
  settings fields and scrollable Ranked form remain usable above the bottom bar.
- Selecting Gaurav filters the five-match list to the expected four matches.
- The signed-out cloud boundary renders only the email/password form, masks the
  password, enforces an eight-character browser minimum and does not expose the
  tracker. No credentials were entered.

No application errors or warnings appeared during the single-client local
tracker run. A multiple-client Supabase warning appeared only after deliberately
opening a second development origin in the same in-app browser storage context;
this is a test setup artifact and not the normal single-client path.

## Realtime release gate

The two-session insert/update/delete and visibility/focus recovery test was not
run against production because `202609150001_realtime_match_updates.sql` and the
new frontend are not deployed. Running it now would either test the old build or
require unauthorized production deployment and data mutation.

After deployment to a suitable staging environment—or after explicit production
release authorization—verify with two authenticated member sessions:

1. Create a uniquely identifiable test match in session A and confirm session B
   refetches the canonical state without manual refresh.
2. Open an edit draft in session B, update the match in session A and confirm the
   incoming revision is deferred until the draft is closed.
3. Edit and then delete the test match, confirming both sessions recalculate all
   summaries, charts and performance views after each canonical refetch.
4. Hide and restore one tab, then blur and refocus it, confirming one coalesced
   recovery fetch and no duplicated subscription effects.
5. Remove the test record through the normal application flow and confirm the
   final revision and audit history before release sign-off.

Production release should remain gated until this checklist passes.
