# Production deployment

Source repository: https://github.com/lusioerog-dev/mlbb-rank-push-tracker (private). Production source branch: `master`.

Production consists of a Cloudflare Pages frontend, a Cloudflare Worker API,
Supabase sign-in and PostgreSQL shared storage. The stable site is
https://mlbb-rank-push-tracker.pages.dev/ and the API is
https://mlbb-tracker-api.lusioer-og.workers.dev.

The focused tracker release was deployed and verified on 15 September 2026.
Its release details, backup checksum, database inventory and deployment IDs are
recorded in [the release report](2026-09-15-release.md).

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
