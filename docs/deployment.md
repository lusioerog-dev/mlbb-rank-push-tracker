# Production deployment

Source repository: https://github.com/lusioerog-dev/mlbb-rank-push-tracker (private). Production source branch: `master`.

Production consists of a Cloudflare Pages frontend, a Cloudflare Worker API,
Supabase sign-in and PostgreSQL shared storage. The stable site is
https://mlbb-rank-push-tracker.pages.dev/ and the API is
https://mlbb-tracker-api.lusioer-og.workers.dev.

The focused tracker release was deployed and verified on 15 September 2026.
Its release details, backup checksum, database inventory and deployment IDs are
recorded in [the release report](2026-09-15-release.md).

The redesign through Phase 8 is committed but not deployed. In particular,
`202609150001_realtime_match_updates.sql` is pending. Production therefore still
runs the earlier focused tracker until an explicit release is authorized.

## Ordered redesign release

Do not deploy the new frontend before its database support. Use this order:

1. Export and verify a fresh production JSON backup; record the workspace
   revision, member count, active season, match count and history count.
2. Run the complete local checks listed below against the exact release commit.
3. Apply only the pending migration
   `202609150001_realtime_match_updates.sql`. It grants member-scoped browser
   SELECT on match rows and idempotently publishes the table for Realtime; it
   does not grant browser writes.
4. Deploy the Worker with `npx wrangler deploy --keep-vars` and verify the fixed
   workspace setting and allowed production origin remain present.
5. Build and upload only `dist/web` to the existing Pages project.
6. Verify signed-out isolation, both existing member logins, Account/Sign out,
   all six destinations, canonical rank/hero display and responsive layout.
7. Complete the two-session insert/update/delete, draft deferral and
   visibility/focus checklist in [the Phase 7 report](phase-7-test-report.md).
8. Confirm the test match is removed through the application, compare the final
   revision/counts/history, and retain the pre-release backup.

If the migration fails, stop before Worker/frontend deployment. If the frontend
fails before any new writes, redeploy the previous Pages/Worker versions; do not
reverse the additive Realtime policy merely to roll back UI assets. After new
writes, prefer a forward fix and never restore an older snapshot over newer data.

## Cloudflare Pages

Use Node 24, repository root as the working directory, `npm run build` as the
build command, and **`dist/web`** as the output directory. Do not deploy the
whole `dist` directory: it also contains compiled collector tests and tooling.
The browser build requires the public Supabase and Worker endpoint settings;
privileged database credentials stay in the Worker.

For a direct upload deployment:

1. Run `npm ci`, checks, and `npm run build` locally.
2. Package only the contents of `dist/web` into a ZIP, with `index.html` at the root.
3. In Cloudflare Workers & Pages, create a Pages application using direct upload, or open the existing Pages project for subsequent deployments.
4. Upload the ZIP, deploy, and verify the generated HTTPS URL.

Direct-upload projects require another upload for subsequent changes. A Git-integrated Pages project can instead build from this repository using the settings above. Follow Cloudflare's current project-type migration guidance before changing an existing upload project to Git integration.

The `_headers` file adds basic browser security headers. Only application assets are published; Git history, source screenshots, private backups, credentials and `node_modules` are not deployment assets.

Official references checked 2026-09-12: [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

Production: https://mlbb-rank-push-tracker.pages.dev/ — deployed with direct
upload and verified on 15 September 2026. The signed-in dashboard loaded the
revision-8 shared state at 103 stars with three wins and exposed the new Hero
Performance and Lane Performance pages.

## Required checks

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
git diff --check
```

The current suite contains 52 tests. A production build warning for a minified
JavaScript chunk over 500 kB is known and non-fatal; investigate code splitting
separately rather than changing the release artifact during deployment.
