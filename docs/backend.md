# Private shared tracker backend

Reviewed 15 September 2026. The application uses one fixed private workspace,
Supabase Auth/PostgreSQL and a Cloudflare Worker. Historical workspace creation,
invitation and join flows are retired.

## Security boundary

- The browser receives only the Supabase URL, publishable key and Worker URL.
- The Worker verifies the bearer session, confirmed user, configured origin and
  membership of `SHARED_WORKSPACE_ID` for every v2 request.
- The Supabase service-role key is an encrypted Worker secret and must never use
  a `VITE_` variable or appear in `backend-config.json`.
- Anonymous users cannot read tracker data. Authenticated browsers receive only
  member-scoped SELECT on `tracker_matches` for Realtime delivery; all writes and
  canonical reads remain behind the Worker/database functions.
- Public signup, workspace selection, creation, invitation and joining are not
  exposed by the application.

## API

`GET /v2/tracker` returns the canonical active tracker assembled from normalized
season and match records. `PUT /v2/tracker` accepts a runtime-validated compatible
tracker with its expected revision and saves it through `tracker_save_v2`.

The configured shared workspace is server-owned; clients cannot choose another
workspace. Obsolete creation endpoints are rejected. Limited legacy reads remain
only for deployed-client compatibility, while obsolete writes are rejected so an
old client cannot overwrite the v2 model. Authentication, authorization,
validation, conflict and internal errors are mapped without exposing secrets.

## PostgreSQL model

| Relation                   | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| `tracker_members`          | Fixed workspace authorization                |
| `tracker_seasons`          | Active/archived season records and metadata  |
| `tracker_matches`          | Ordered canonical match records              |
| `tracker_heroes`           | Workspace hero identity and observations     |
| `tracker_rank_targets`     | Versioned structured rank target             |
| `tracker_rank_checkpoints` | Confirmed match-boundary rank state          |
| `tracker_workspaces`       | Revision and compatible recovery snapshot    |
| `tracker_history`          | Immutable authenticated snapshot audit       |
| `tracker_invites`          | Inert historical rows; no application access |

Successful saves are one transaction: compare the expected revision, update
normalized records, update the recovery snapshot and append history with the
authenticated actor. Database constraints enforce one active season, supported
position values, hero references and non-null workspace Battle ID uniqueness.

## Realtime behavior

`202609150001_realtime_match_updates.sql` grants authenticated users SELECT only
when `tracker_members` contains their user/workspace pair and adds
`tracker_matches` to `supabase_realtime`. The frontend listens to all match event
types, treats them only as invalidation, and refetches through the Worker. It does
not trust or merge payload rows directly.

The migration is committed but not applied to production. Deploy it only in the
ordered release procedure in [deployment](deployment.md), then complete the live
two-session checklist in [the Phase 7 test report](phase-7-test-report.md).

## Local development and verification

Use an isolated Supabase project for integration development and ignored
`.dev.vars` for Worker secrets. Set its allowed origin to the exact local origin.
Never point destructive automated tests at production.

`npm test` uses embedded PostgreSQL and Worker request doubles; it needs no
Docker. It covers member isolation, unauthenticated rejection, retired routes,
legacy compatibility, version conflicts, atomic save/history, migration
backfills, constraints, Realtime policy/publication and error redaction. These
tests do not replace live Auth or two-session Realtime verification.

Current scale boundaries are deliberate: one fixed manual push, whole-state v2
saves with a 4 MB Worker request limit, no offline write queue, and no verified
FightHistory parser or background Android ingestion.
