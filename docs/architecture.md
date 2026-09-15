# Current architecture

Reviewed 15 September 2026. This document describes the implemented private
manual tracker. FightHistory decoding remains separate research and is not a
production ingestion path.

## Runtime topology

```text
Cloudflare Pages
  React + TypeScript UI
    -> Supabase Auth (browser session)
    -> Cloudflare Worker /v2/tracker (Bearer token)
         -> Supabase Auth verification
         -> fixed-workspace membership check
         -> PostgreSQL tracker_read_v2 / tracker_save_v2

Supabase Realtime tracker_matches event
    -> browser invalidation signal
    -> canonical Worker refetch
    -> all selectors recalculate together
```

`apps/web` owns authentication screens, the tracker shell, Account page, manual
Ranked form and responsive presentation. `packages/tracker` owns runtime
validation, compatibility, rank rules, canonical hero metadata, season
transitions, statistics, exports and the browser-storage adapter. `apps/api`
owns HTTP/auth boundaries and calls database functions; it does not duplicate
domain calculations. `collector` remains an isolated, non-importing research
tool that hashes selected FightHistory bytes and fails closed.

## Authentication and authorization

`Cloud.tsx` creates one Supabase client from public connection settings. Signed-
out users see only the sign-in boundary. A valid session is passed to the Worker
as a short-lived access token; the frontend never receives the service-role key.
The Worker verifies the token, confirmed identity, allowed origin and membership
of the configured `SHARED_WORKSPACE_ID` on every request.

The tracker has no generic workspace creation, invitation, joining or workspace
selection UI. Both authorized people edit the same fixed private push, while the
authenticated editor remains distinct from the player attributed to a match.
Account/session details and Sign out live only on the dedicated Account page.

## Canonical storage and writes

Normalized `tracker_seasons` and `tracker_matches` rows are the live read model.
`tracker_heroes`, `tracker_rank_targets` and `tracker_rank_checkpoints` normalize
identity and rank-specific fields. `tracker_members` authorizes access.
`tracker_workspaces.state` and `tracker_history` retain compatible JSON snapshots
for recovery and server audit.

`tracker_save_v2` validates the expected revision and updates the active season,
normalized matches, recovery snapshot and immutable history atomically. A stale
write returns HTTP 409. Season rollover archives the old season and establishes
the new confirmed baseline in the same save. Browser roles cannot write these
tables directly; all mutations pass through the authenticated Worker.

Battle ID is optional text so leading zeroes survive. Non-null Battle IDs are
unique within the workspace. Matches retain stable player and hero references,
original hero observations, played position, actual star delta, provenance and
correction history. Unknown values remain unknown rather than becoming guesses.

## Realtime and draft safety

The browser subscribes once to member-visible `tracker_matches` changes. Insert,
update and delete payloads are invalidation signals only: the client always
refetches the complete canonical state through `GET /v2/tracker`. Concurrent
signals are coalesced. Focus and visibility recovery also request a canonical
refetch.

An open Ranked form or Settings draft is never silently overwritten. Incoming
state is deferred until editing ends. Subscription, focus and visibility
listeners are removed when the session/application changes. The previous manual
Refresh control and 15-second polling loop are removed.

The Realtime migration and frontend in this branch are not yet deployed. The
two-session insert/update/delete and recovery checklist in
[the Phase 7 report](phase-7-test-report.md) is a mandatory release gate.

## Derived views

Rank is shared-account history, not a mutable field on either player. The
versioned rank engine applies chronological actual deltas from a confirmed season
baseline and stops at uncertain placement/demotion boundaries until a confirmed
checkpoint. One display adapter supplies tier, division/band, local or continuous
stars and progress semantics to React. See [rank rules](rank-rules.md).

The versioned 133-hero catalog maps only confirmed numeric Moonton IDs to
canonical names and current base portraits. Historical observations are retained;
unknown IDs use a non-crashing fallback. See [hero metadata](hero-metadata.md).

All account summaries and graphs use all Ranked matches. Player filters affect
match, contribution, hero and lane views, not shared-account progression.
Positions are recorded per match and never inferred from hero class.

## Portability and deferred ingestion

JSON export contains the full compatible tracker and correction history; CSV is
a spreadsheet-safe match-row export. Local browser mode exists only for
development/recovery when `backend-config.json` is `null` under Vite development.
Production fails closed without valid shared-backend configuration.

Future FightHistory ingestion must preserve the established boundary:
discovered bytes -> verified parser -> runtime validation -> normalization ->
idempotent authenticated save. No binary offsets or fields are considered
verified today, and no screenshot or local backup freezes that future contract.
