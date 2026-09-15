# Hero metadata and portraits

Reviewed 15 September 2026. `packages/tracker/heroes.ts` is the single controlled
game-wide catalog. It maps the raw numeric Moonton hero ID to the canonical hero
name and current base portrait URL. Workspace heroes and matches continue to keep
their stable internal references and original observations; the catalog supplies
display metadata and does not rewrite historical evidence.

## Source and attribution

The snapshot contains 133 heroes, IDs 1–133. It was retrieved from the current
Moonton website data through the maintained [Rone Arena API](https://arena.rone.dev/)
hero-list wrapper. Portraits are served from Moonton's `akmweb.youngjoygame.com`
CDN and are the `hero.data.head` base portraits, not skin artwork. Names and the
Benedetta ID were cross-checked against [Moonton's official lore site](https://play.mobilelegends.com/lore/hero/Benedetta).

Game data and portrait art © Moonton / Mobile Legends: Bang Bang. API wrapper
maintained by ridwaanhall / RoneAI. This project is unofficial and is not
affiliated with or endorsed by Moonton.

The older `mapi.mobilelegends.com/hero/list` endpoint was not used for the final
snapshot because it stopped at hero 124 during this review. The browser never
depends on either API at runtime.

## Resolution and fallback

Only a numeric game ID resolves catalog metadata. Leading zeroes are normalized
for lookup, so `00097` resolves to Benedetta while the exact observation remains
stored. Names alone never select a portrait because that could silently attach
the wrong art. Known IDs use the catalog's canonical name throughout the UI.

`HeroPortrait.tsx` is the shared renderer used by Hero Performance and Match
History. An unknown ID, missing hero, or image load failure renders a clean text
fallback and never crashes. Unknown numeric IDs remain in the workspace registry
so a later catalog refresh can resolve them without editing old matches.

## Updating the snapshot

Fetch the complete English hero list from the Rone Arena `/api/heroes` endpoint,
retain only `hero_id`, `hero.data.name`, and `hero.data.head`, sort numerically,
and replace `HERO_CATALOG`. Before committing, verify the expected count and ID
range, unique IDs/names, HTTPS Moonton CDN host, a few known IDs against the
official lore/game UI, and run the full tests. Record the review date here and in
the generated-file header. Do not accept skin galleries or third-party image
hosts as base portraits.

No database migration is needed. Portrait metadata is global, versioned with the
application, and must not be duplicated into each private workspace's hero rows.
