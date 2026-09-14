# Private shared push: Phase 1b

This supersedes the generic workspace setup in the historical backend guide.
Phase 1b is a local code/migration checkpoint, not a production deployment.

## Verified live inventory

On 2026-09-14, read-only Supabase SQL queries confirmed:

- One workspace: `0a5a48f9-4040-418c-a49c-4fc7719ed423`.
- Revision 4, two Ranked matches, two existing members.
- Player IDs `gaurav` and `rupesh`, with matching display names.
- Five retained history snapshots (revisions 0 through 4), one invitation row.
- Current season label is empty; the push name is `New season`.
- Baseline: Mythic, 100 stars. The live dashboard displays 102 recorded stars.

The full snapshot query was read, but browser download attempts did not produce a
verified local backup file. Obtain and verify a fresh backup of workspace state,
membership and history before applying database changes. These observations do
not establish that the four screenshot seed matches should be merged into cloud
data; keep local/browser records separate until explicitly reconciled.

No production rows, memberships, functions or privileges were changed in this phase.

## Implementation

The Worker uses `SHARED_WORKSPACE_ID` from its environment and always checks the
authenticated user's existing membership in that workspace. There is no fallback
to the first workspace and no client-selected workspace. A missing/invalid setting
fails closed. The verified production UUID is recorded in `wrangler.jsonc`; use an
isolated test workspace and credentials for local API development.

`GET /tracker` and `PUT /tracker` read/save the shared push. The old GET list and
fixed-workspace GET/PUT URLs remain only for deployed-client compatibility and
cannot expose another workspace. POST creation, join and invite endpoints are
removed. Confirmed Supabase sign-in, server-only credentials, revision checks and
authenticated history remain unchanged.

The frontend opens the push immediately after sign-in. Generic creation, joining,
invitations, workspace selection, public signup and personal/shared switching are
removed. Production missing configuration fails closed. A null connection config
can still enable the local storage adapter in development only. Settings provides
a raw browser-backup recovery download without loading or replacing cloud data.

Visible player names come from fixed Gaurav/Rupesh IDs. Original stored names and
audit data remain preserved. Additional or unmapped player IDs are rejected rather
than silently reassigned. Export the raw backup for manual reconciliation if such
legacy records are encountered. Season lifecycle and baseline protection remain
Phase 4 work; generic workspace creation is no longer a new-season mechanism.

## Migration and rollout

1. Verify a fresh backup and recheck the inventory for changes since this audit.
2. Deploy the Worker with the explicit shared-workspace environment setting.
3. Apply `202609140001_retire_platform_flows.sql`, then deploy the frontend.
4. Verify both existing logins can load/save the same push and unrelated users
   cannot access it. Confirm row counts and historical snapshots are preserved.

The migration drops `tracker_create` and `tracker_join` without CASCADE and revokes
service-role access to `tracker_invites`. It deletes no rows. Invitations remain
inert for the final archival review. `tracker_save`, membership, RLS and snapshot
history remain intact. Unexpected function dependencies stop migration execution.

For rollback, restore the two function definitions and their grants from the
original tracked migration, restore the invite service-role grant, and deploy the
previous application checkpoint. Do not rerun the original table-creation migration.

## Verification

36 tests passed, including both members' access, unknown/unconfirmed user rejection,
retired endpoints, fixed-workspace isolation, immutable attribution, old-client
compatibility, and migration preservation of rows/history/concurrent-save checks.
Typechecking, lint, formatting and build passed. The build still warns about a large
JavaScript chunk. Local browser checks confirmed fixed player labels, removal of
player-editing controls, and a successful Settings save without console errors.
Production deployment verification remains pending because this phase was not deployed.
