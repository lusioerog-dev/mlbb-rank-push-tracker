# Shared manual tracker backend

Historical setup below describes the original platform. For current private-push behavior and deployment order, see [Phase 1b](private-push.md). Creation and invitation instructions below no longer apply to the refactored code.

Implementation and production configuration added 2026-09-13. Publishing is performed explicitly through Wrangler; pushing GitHub alone does not update this direct-upload Pages project.

Deployment progress on 2026-09-13: Supabase project `xanckgfnjampzgijdnxx` is healthy, the migration ran successfully, and Auth site/redirect URLs are configured. The Worker is deployed at `https://mlbb-tracker-api.lusioer-og.workers.dev` with the approved service-role key stored as an encrypted secret. The owner login exists. Public access to all four tracker tables is denied, and unauthenticated API requests return 401. An authenticated live save/reload still requires the owner to sign in to the website.

The public connection file contains only the Supabase publishable key and URLs. Public registration/email recovery are hidden until a working SMTP sender is configured (`emailAuthEnabled: true`). For this private tracker, provision confirmed users through Supabase Auth; each player uses their own login and joins the same workspace. Never share the owner's password.

For updates, deploy the Worker first with `npx wrangler deploy --keep-vars`, build, then run `npx wrangler pages deploy dist/web --project-name mlbb-rank-push-tracker --branch main`. Pages' production branch is `main`; the GitHub repository branch is `master`. These are separate settings. The root Wrangler file configures the Worker, so Pages intentionally ignores it when deploying the explicitly named static directory.

## Design

The browser signs in with Supabase Auth and sends its short-lived access token to a Cloudflare Worker. The Worker verifies the user with Supabase Auth on every request, requires a confirmed email, validates the manual tracker contract, and checks workspace membership. Database tables have RLS enabled and deny direct access to anonymous and authenticated browser roles. Only the server-side service role can access storage. Never place that key in the frontend configuration.

Each shared workspace contains a versioned JSON snapshot of the existing manual tracker. This deliberately preserves current exports, unknown fields, player/hero references and manual correction history; it is not the deferred FightHistory ingestion schema. PostgreSQL performs a compare-and-swap update against the expected revision and records an immutable server-side snapshot with the authenticated actor in the same transaction. A stale save returns HTTP 409. Restore is a replacement and is also retained in server history.

The owner creates a random 256-bit invitation code. Only its SHA-256 hash is stored. It expires after 24 hours and is consumed atomically when a confirmed user joins. Share codes privately; they grant editing access. Teammates have separate sign-ins and share the same workspace. Human player attribution remains independent from the signed-in editor.

Shared dashboards refresh every 15 seconds while visible. An open match form or Settings page is never overwritten by polling: a notice asks the user to refresh. Failed writes keep the form open and do not report success. There is no offline write queue. Local browser data remains available separately and is copied to the cloud only when the user chooses to create a shared tracker. Demo data cannot be uploaded or restored into shared storage.

## Activate production

1. Create the free Supabase project `mlbb-rank-push-tracker`. Save its database password privately.
2. Run `supabase/migrations/202609130001_shared_tracker.sql` in its SQL editor once. The migration creates the private tables, transactional functions and grants.
3. In Supabase Auth URL configuration, set the site URL and allowed redirect URL to `https://mlbb-rank-push-tracker.pages.dev`. Keep email confirmation enabled. Configure a verified SMTP sender before inviting general users; Supabase's default mail service restricts delivery. See the official [SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).
4. Sign in to Cloudflare CLI with `npx wrangler login`. Set the server secrets with `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`. Supply values through the interactive prompts, not shell history or Git. The key must belong to this project.
5. Run `npm run api:deploy`. `wrangler.jsonc` restricts browser CORS to the live Pages origin. Save the resulting Worker URL.
6. Replace the `null` in `apps/web/public/backend-config.json` with the public configuration below. Only the publishable (or legacy anon) key belongs here. `null` deliberately preserves local-only mode until the backend is ready; invalid or unavailable configuration fails visibly.

```json
{
  "supabaseUrl": "https://YOUR_PROJECT.supabase.co",
  "publishableKey": "YOUR_PUBLIC_PUBLISHABLE_KEY",
  "apiUrl": "https://YOUR_WORKER.workers.dev"
}
```

7. Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build`. Upload only `dist/web` to the existing Cloudflare Pages project. Its direct-upload setup does not redeploy on Git pushes.
8. Sign up and confirm the owner's email, then create the shared tracker from the correct browser's real matches. Export/restore the existing local backup into the personal browser tracker first if needed. Generate an invitation for Gaurav; he signs in with his own account and uses Join tracker.
9. Verify two signed-in browsers see the same data, edits survive refresh, and a stale simultaneous edit is rejected. Verify an unrelated signed-in user cannot read the workspace. Keep the local export until migration is verified.

## Local development and checks

Use an isolated Supabase project for development. Put Worker secrets in ignored `.dev.vars`; set the dev `ALLOWED_ORIGIN` to `http://127.0.0.1:5173` when running Wrangler. Never point automated destructive tests at production.

`npm test` includes an embedded PostgreSQL migration test, requiring no Docker, and Worker request tests. These check direct browser-role denial, nonmember rejection, stale revisions, server audit attribution, invitation expiry/consumption and error redaction. They do not substitute for production Auth, SMTP or two-device deployment verification.

Current limitations: one manual push per workspace; shared storage uses whole-state snapshots (4 MB request limit); invitation expiry rather than a membership-management UI; no collector tokens, binary parsing, background Android collection or automated ingestion yet. Remove a member through an authenticated administrator's SQL operation if needed. Retention and migration to normalized match tables should be addressed before high-volume use.

Security references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database functions](https://supabase.com/docs/guides/database/functions).
