import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HERO_CATALOG,
  heroMetadataByGameId,
  normalizeHeroGameId,
} from "./heroes";

test("controlled hero catalog has unique current numeric IDs and official CDN portraits", () => {
  assert.equal(HERO_CATALOG.length, 133);
  assert.equal(new Set(HERO_CATALOG.map((hero) => hero.gameId)).size, 133);
  assert.equal(new Set(HERO_CATALOG.map((hero) => hero.name)).size, 133);
  for (const hero of HERO_CATALOG) {
    assert.match(hero.gameId, /^\d+$/);
    assert.match(
      hero.portraitUrl,
      /^https:\/\/akmweb\.youngjoygame\.com\/web\/svnres\/img\//,
    );
  }
  assert.deepEqual(heroMetadataByGameId("00097"), {
    gameId: "97",
    name: "Benedetta",
    portraitUrl:
      "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_1_88_1205_1/100_b4a5e537894bdc00787e80e4d3ada5dd.png",
  });
});

test("unknown and malformed hero IDs remain unresolved without guessing by name", () => {
  assert.equal(normalizeHeroGameId("00001"), "1");
  assert.equal(heroMetadataByGameId("99999"), null);
  assert.equal(heroMetadataByGameId("Benedetta"), null);
  assert.equal(heroMetadataByGameId(null), null);
});
