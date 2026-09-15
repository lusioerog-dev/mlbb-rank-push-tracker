# Implementation status

Last updated: 15 September 2026 (Asia/Kathmandu)

## Current phase

Phase 2 — dedicated Account page. Implementation and verification are complete.
The next authorized work is Phase 3, but it must not begin until the user says
`CONTINUE`.

## Completed phases

- Phase 0: audited the relevant application, domain, API, migration, test and
  deployment code; reviewed the existing architecture/release records; and
  inspected the signed-in production Overview and Hero Performance screens.
- Phase 1: removed the authenticated email/Sign out bar from every tracker page,
  removed its obsolete styles and tightened the desktop content offset. The
  standalone sign-in, session gate and connection-recovery screens remain.
- Phase 2: added a dedicated authenticated Account page with email, sign-in
  provider, shared-session status and Sign out; separated tracker and account
  navigation; and fitted all six destinations into the phone bottom bar.

## Audit summary

### Application structure and deployment

- React 19 + TypeScript + Vite frontend in `apps/web`, with Tailwind imported but
  most presentation implemented in `apps/web/src/style.css`. There is no router
  package: `App.tsx` holds an in-memory `Page` union and switches page components.
- `Cloud.tsx` is the authentication/remote-storage boundary. It creates one
  Supabase browser client, listens for auth-session changes, and sends the access
  token to a Cloudflare Worker. The browser never receives privileged database
  credentials.
- The Worker in `apps/api/index.ts` verifies the Supabase access token and fixed
  workspace membership, then calls PostgreSQL functions for canonical v2 reads
  and revision-checked writes.
- Production is a direct-upload Cloudflare Pages site plus a Cloudflare Worker
  and Supabase Auth/PostgreSQL. A Git push alone does not deploy Pages.

### Navigation, account header and authentication

- The fixed desktop sidebar owns Overview, Match history, Hero performance, Lane
  performance and Settings. At phone width it becomes a five-item bottom bar.
- `Cloud.tsx` renders `.cloud-bar` _outside_ `App` and therefore outside the
  `.workspace` element that receives the sidebar offset. The bar spans the full
  viewport, while `.sidebar` is fixed at the left. In production the sidebar
  covers the beginning of the email; the account bar also consumes about 100 px
  above every tracker page. This is the direct cause of the reported overlap and
  wasted space. There is no Account page.
- Supabase Auth supports password sign-in; optional email-link sign-in is gated
  by public configuration. `onAuthStateChange` and `getSession` establish the
  session, protected tracker content renders only with a session, and Sign out
  currently calls `client.auth.signOut()` from the global cloud bar.

### Database and match flow

- `tracker_workspaces` retains a legacy JSON snapshot/revision and
  `tracker_history` retains revision history. `tracker_members` controls the
  fixed private workspace membership.
- The normalized live model uses `tracker_seasons` (one active season per
  workspace) and `tracker_matches`. Successful saves are atomic, check the
  expected revision, rewrite the active season's normalized match rows, update
  the recovery snapshot and append history.
- `tracker_heroes` is an account-level registry. Matches retain stable internal
  hero references plus optional observed name and game ID. Database constraints
  protect account-wide Battle ID and hero game-ID uniqueness. Position is stored
  per match and restricted to the five supported positions.
- `tracker_rank_targets` and `tracker_rank_checkpoints` normalize versioned rank
  targets and confirmed match-boundary checkpoints. Triggers keep them aligned
  with the canonical JSON records.
- Manual entry runs through Zod/domain validation in `packages/tracker/model.ts`,
  then `RemoteStore.save`, Worker validation and `tracker_save_v2`. A successful
  server response replaces React state, so all selectors recalculate from the
  saved source of truth.

### Refresh and realtime

- Initial shared load is a single `GET /v2/tracker` from `App.tsx`.
- There is no Supabase Realtime channel and no `postgres_changes` subscription.
  Instead, an effect polls the Worker every 15 seconds while the tab is visible.
  Its dependencies include the complete `state`, `editing` and `page`, so the
  interval is torn down and recreated whenever those values change.
- The large Refresh button increments a local reload counter after confirmation,
  discarding the loaded state and refetching. There are no explicit visibility
  or focus listeners. Draft protection prevents silent replacement while a form
  or Settings is open but currently requires the user to press Refresh.

### Rank and season logic

- Rank is already partly derived: a structured season baseline plus chronological
  ranked-match deltas flows through `accountProgression`, `advanceRank` and
  `currentRank`. Rank-aware targets use `rankOrder`. Settings supports a confirmed
  starting rank, starting division/stars, target, audited baseline correction and
  atomic season rollover.
- The centralized `RANK_RULES` covers Warrior through Legend division counts and
  stars, plus Mythic/Honor/Glory/Immortal thresholds. Actual recorded delta—not
  win/loss—is applied, and uncertain placement/demotion boundaries become
  unknown until a checkpoint.
- Why it still does not fully behave like MLBB: the rules are an intentionally
  limited 2026-09 configuration backed by secondary/editorial sources; placement,
  Mythic-to-Legend demotion and reset mapping are explicitly unverified. In
  addition, the Overview mixes cumulative season balance (`rank.stars`) with
  local division/Mythic stars (`rank.rankStars`) and presents only a generic star
  emblem. The underlying engine is therefore safer than an arbitrary running
  number, but it is not yet a complete, verified progression/reset model.

### Heroes and performance

- `recordHeroObservation` resolves one shared in-state hero registry by verified
  game ID or normalized name, preserves observations, and adds aliases. The SQL
  registry mirrors those records. Unknown hero fields remain nullable.
- Hero Performance correctly derives selected-player totals and sorts by games
  descending, then win rate descending, then name. Lane Performance derives from
  the recorded match position and uses Lucide position symbols.
- Why hero icons are missing: the Hero model/schema has no `iconUrl`; the registry
  only contains internal ID, optional `gameId`, name and aliases. `Performance.tsx`
  deliberately renders the first two name letters, and `MatchHistory.tsx` does
  the same. Existing release docs explicitly deferred official portraits. There
  is no controlled Moonton-ID-to-current-base-portrait dataset or shared image
  component, so the UI cannot render a verified portrait.

### Settings and tests

- Settings contains tracker/season configuration, rank baseline and target,
  rollover, backup/restore and correction history. It does not contain account
  session controls, which makes it a clean boundary for adding a separate Account
  destination.
- Automated coverage consists of collector, tracker/domain and Worker/PostgreSQL
  tests. Rank boundary, unknown-data, correction, rollover, hero/position sorting,
  identity, authorization and concurrency cases are covered. There are no React
  component, end-to-end, Realtime or automated responsive-layout tests.

### Live deployment observations

- Signed-in production loaded the shared tracker at Mythical Immortal 103 stars,
  3–0, with Gaurav/Rupesh contribution and three ranked matches.
- The account email and Sign out bar visibly overlaps the fixed sidebar exactly as
  the source predicts. The same global bar and Refresh action appear on Hero
  Performance. Hero rows and recent-match rows use `BE`/`AU` initials rather than
  portraits. No production writes were made during the audit.

## Root causes

1. Account/header overlap: the globally rendered `.cloud-bar` has no sidebar
   offset or responsive ownership and precedes the app shell, while the sidebar is
   fixed and overlays it.
2. No reliable live updates: the frontend only polls a revisioned Worker snapshot
   every 15 seconds and offers a manual reload; it never subscribes to normalized
   table changes and has no focus/visibility recovery hooks.
3. Incomplete MLBB rank behavior: verified lower-ladder/Mythic thresholds exist,
   but reset and placement/demotion rules are intentionally absent, and current UI
   semantics do not cleanly distinguish cumulative season progress from stars in
   the displayed rank state.
4. Missing hero art: hero metadata contains no portrait field or maintained
   verified external mapping, and both consuming screens explicitly render text
   initials.

## Implementation plan

1. Phase 1: remove the authenticated global cloud bar from tracker pages and its
   CSS, pass account/session capabilities into the app without adding a navbar,
   and tighten top spacing. Preserve signed-out and connection-error screens.
2. Phase 2: add an Account page and sidebar destination; show the authenticated
   email, available provider/session status and working Sign out. Rebalance the
   phone navigation for six destinations.
3. Phase 3: remove manual Refresh; add one cleaned-up Supabase Realtime
   subscription for the relevant normalized tables, a coalesced state refetch,
   and visibility/focus recovery without reloading or overwriting active drafts.
4. Phase 4: verify current MLBB rules before changing them, document verified
   rules versus assumptions, evolve the centralized engine/state/display API, and
   add boundary/reset/override tests plus the primary-rank-card treatment.
5. Phase 5: establish one controlled Moonton hero-ID metadata source with current
   base portraits, a resilient shared hero-image component and unknown/load-error
   fallbacks; use it in Hero Performance and Match History. Add a migration only
   if persistence is justified after reconciling the existing registry.
6. Phase 6: integration and responsive cleanup while preserving the fixed
   two-player, Ranked-only, Battle-ID, position, contribution and graph decisions.
7. Phase 7: full automated and manual test pass, including two-session Realtime
   insert/update/delete and visibility/focus recovery tests.
8. Phase 8: finalize architecture, maintenance, migration and testing docs.

## Files changed

- Phase 0: `docs/IMPLEMENTATION_STATUS.md` — added the audit/checkpoint.
- Phase 1: `apps/web/src/Cloud.tsx` — signed-in sessions now render the protected
  tracker directly; signed-out authentication and errors remain standalone.
- Phase 1: `apps/web/src/style.css` — removed unused `.cloud-bar` rules and reduced
  the desktop top padding from 42/45 px to 30/32 px.
- Phase 1: `docs/IMPLEMENTATION_STATUS.md` — recorded the completed phase and the
  continuation point.
- Phase 2: `apps/web/src/Account.tsx` — added the focused account/session view,
  pending Sign out state and inline failure handling.
- Phase 2: `apps/web/src/Cloud.tsx` — passes authenticated session metadata and
  the Supabase Sign out action into the protected tracker.
- Phase 2: `apps/web/src/App.tsx` — added the conditional Account destination,
  split primary/secondary navigation, and keeps tracker actions off Account.
- Phase 2: `apps/web/src/style.css` — added Account presentation, desktop nav
  separation and six-item mobile navigation layout.
- Phase 2: `docs/IMPLEMENTATION_STATUS.md` — recorded completion and Phase 3 handoff.

## Database migrations made

- None in Phases 0, 1 or 2.
- Existing production migrations inspected: `202609130001_shared_tracker.sql`
  through `202609140005_rank_checkpoints.sql`.

## Tests completed

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — passed, 46 tests.
- `npm run build` — passed; existing Vite large-chunk warning remains.
- `npm run format:check` — passed.
- Manual production audit — passed for read-only loading/navigation; confirmed the
  header overlap and initial-only hero treatment. Auth mutations and database
  writes were intentionally not exercised in this audit phase.
- Phase 1 local desktop inspection — passed: content begins at the top of the
  sidebar-aligned workspace with no account bar, email, Sign out control or empty
  header band.
- Phase 1 local 390 × 844 inspection — passed: content starts at the top, the
  five-item bottom navigation remains usable and no removed-header gap remains.
- Signed-out behavior remains guarded by `Cloud.tsx`; typechecking confirms the
  password and optional email-link paths remain wired.
- Phase 2 local desktop inspection — passed: Account is separated below Settings,
  the page shows only account/session information and Sign out, and the tracker
  heading has no unrelated Record action.
- Phase 2 local 390 × 844 inspection — passed: all six destinations fit the fixed
  bottom bar, Account remains readable and no content is obscured.
- The Sign out button invokes the real `client.auth.signOut()` path and reports a
  failure without hiding the session. A live click was intentionally not made
  because this phase was not deployed and the local visual fixture used a no-op.

## Known issues

- Manual Refresh and 15-second polling remain; no Supabase Realtime integration.
- Rank rules remain deliberately incomplete at unverified reset/placement/demotion
  boundaries, and the main rank visual is generic.
- No verified current-base hero portrait mapping; hero UI uses initials.
- No component/E2E/Realtime test harness. Production data cannot be safely mutated
  merely to test during an audit.
- Existing Vite build warning reports a JavaScript chunk larger than 500 kB.

## Decisions made

- Preserve the current React/domain/Worker/PostgreSQL architecture; do not rebuild.
- Keep normalized match rows as the live source and legacy snapshot/history as the
  recovery boundary.
- Keep Settings for tracker configuration and place auth/session actions only on
  Account.
- Preserve actual star deltas, explicit uncertainty and checkpoints; do not infer
  stars from match results or invent season-reset rules.
- Extend the existing canonical hero registry instead of creating component-local
  maps; preserve unknown numeric IDs and provide a non-crashing visual fallback.
- Implement Realtime as an invalidation/refetch signal so the Worker/domain read
  path remains canonical and all derived views update together.
- Keep authenticated account controls out of the global tracker shell. Phase 1
  removes them; Phase 2 will restore Sign out in the dedicated Account page.
- Expose only stable, useful Supabase session metadata on Account: email,
  provider and connection status. Do not expose user IDs, tokens or tracker
  configuration.
- Keep Account conditional on an authenticated cloud session; local browser mode
  does not fabricate an account destination.

## Exact next task

Phase 3 only: remove the manual Refresh button and replace polling with a single,
cleaned-up Supabase Realtime invalidation subscription for relevant ranked-match
data. Refetch canonical application state without a browser reload; coalesce
events, preserve active drafts, add visibility/focus recovery and prevent
duplicate subscriptions or request storms. Add focused tests for the refetch
coordinator where practical, manually verify connection/UI behavior, run all
checks, update this file, commit separately, report, and stop.

## Commands needed to resume

```sh
git log --oneline -10
git status --short
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

## Git state

- Branch: `codex/phase-1b-private-push`
- Phase 0 starting commit: `c5d1e148eb2ac98fb57ff282a0f7ccebc2b65823`
- Phase 0 commit: `28c9cc7` (`docs: audit tracker redesign phase 0`).
- Phase 1 starting commit: `28c9cc75055b35c4212e525833751bba81220e5a`.
- Phase 1 checkpoint: the top commit with message
  `phase 1: remove global account header`.
- Phase 1 commit: `a4bb455` (`phase 1: remove global account header`).
- Phase 2 starting commit: `a4bb455a4b1a325d2921df50701b694c8b6258f2`.
- Phase 2 checkpoint: the top commit with message
  `phase 2: add dedicated account page`.
