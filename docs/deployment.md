# Publishing the manual tracker

Source repository: https://github.com/lusioerog-dev/mlbb-rank-push-tracker (private). Production source branch: `master`.

The current application is a static frontend. Publishing gives it a reachable URL, but each browser still has independent local data. Localhost data does not automatically move to the deployed origin: export JSON from the old browser/origin and restore it at the new one. There is no Supabase database or account login to configure for this release.

## Cloudflare Pages

Use Node 24, repository root as the working directory, `npm run build` as the build command, and **`dist/web`** as the output directory. Do not deploy the whole `dist` directory: it also contains compiled collector tests and tooling. No secrets or environment variables are needed by the browser app.

For a direct upload deployment:

1. Run `npm ci`, checks, and `npm run build` locally.
2. Package only the contents of `dist/web` into a ZIP, with `index.html` at the root.
3. In Cloudflare Workers & Pages, create a Pages application using direct upload, or open the existing Pages project for subsequent deployments.
4. Upload the ZIP, deploy, and verify the generated HTTPS URL.

Direct-upload projects require another upload for subsequent changes. A Git-integrated Pages project can instead build from this repository using the settings above. Follow Cloudflare's current project-type migration guidance before changing an existing upload project to Git integration.

The `_headers` file adds basic browser security headers. Only application assets are published; Git history, source screenshots, private backups, credentials and `node_modules` are not deployment assets.

Official references checked 2026-09-12: [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

Production: https://mlbb-rank-push-tracker.pages.dev/ — deployed with direct upload and verified on 2026-09-13. The live dashboard loaded the four seeded matches and shared account total of 117 stars.
