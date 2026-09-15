# Rank rules and season setup

Reviewed 2026-09-15. The versioned configuration and rank transitions live in `packages/tracker/rank-rules.ts`; selectors in `model.ts` are shared by manual entry and future ingestion.

## Verified rules

[Google Play's current rank guide](https://play.google.com/store/apps/editorial?hl=en_US&id=mc_games_editorial_evergreen_postinstall_how_ranks_works_mobile_legends_gamehub_fcp) confirms the seven-rank order, Roman-numbered lower divisions, stars earned/lost, bonus-star gauges and protection. [Apple's MLBB editorial](https://apps.apple.com/hn/iphone/story/id1706942214?l=en-GB) confirms that Mythic uses stars and Mythical Immortal begins at 100. A current independent guide with in-game screenshots documents the exact lower-division counts and the 25/50/100 Mythic bands: [INSERT FUTURE, reviewed 17 August 2026](https://insertfuture.com/en/article/mobile-legends-ranks-order-stars-mythic).

Configuration: Warrior III–I, three stars; Elite III–I, four; Master IV–I, four; Grandmaster/Epic/Legend V–I, five. Mythic uses a continuous count, with Honor at 25, Glory at 50 and Immortal at 100. Recorded actual deltas include bonuses and protection; never infer a delta solely from victory or defeat. Lower division promotion carries one star into the next division; loss below zero moves to the previous division with one fewer than its full star count.

## Observed reset rules requiring confirmation

No first-party, stable Moonton reset table was found. Two current independent sources agree on the Season 41 to Season 42 mapping: [MLBBHub's table, reviewed 15 September 2026](https://mlbbhub.com/server-time/season-schedule) and [INSERT FUTURE's 2026 guide](https://insertfuture.com/en/article/mobile-legends-ranks-order-stars-mythic). The engine therefore exposes a dated `getSeasonResetSuggestion()` for rows whose division is explicit. Settings can copy that suggestion into the new-season draft, but the user must still compare it with the in-game result and confirm it. It is never applied automatically. Warrior and Elite suggestions remain unavailable because the cited table does not specify their resulting division.

This observed mapping is deliberately marked `secondary-sources-require-confirmation`. It must be reviewed for a later season rather than silently reused.

## Assumptions and limits

Mythic placement outcomes and demotion below Mythic zero are not safely established by the first-party sources. The independent guide describes ten placement matches but not a deterministic star award. The engine therefore returns an unknown rank at those boundaries rather than inventing an award. Placement remains visibly pending until a match records the confirmed result, its source and confirmation time. A confirmed rank checkpoint can resume calculation after placement or any other unknown gap. Correcting a checkpoint retains its earlier value and recalculates every later match. These are explicit limits, not claims of fully automated handling of every game rule.

## Calculations

`getRankDisplay()` is the single display adapter. Lower ranks expose their tier,
division and stars within that division; Mythic exposes its 25/50/100 band and
continuous star count. The primary card does not reinterpret cumulative season
stars as local division stars.

Account progression uses all ranked records sorted by time, regardless of the dashboard's player filters. Start with the season baseline and apply each actual delta. By day groups these points in the workspace timezone, carrying the preceding balance forward and omitting days without games. By game retains the baseline and individual points. Unknown deltas create gaps, not zero gains.

For Mythic seasons the graph is the account's continuous star count. For seasons starting below Mythic, local division stars wrap at promotion, so the graph shows continuous season star progress (starting stars plus net delta), explicitly labelled separately from the derived rank's local stars. A placement checkpoint updates rank stars, not that cumulative progress balance.

Player contribution and hero statistics group canonical records. Playtime sums only known durations and reports coverage; a partial total says recorded. Changing or deleting a match, backdating, or restoring a backup recalculates all selectors.

## Targets and compatibility

Targets now contain tier, division, stars and the rules version. Progress compares the confirmed current position with that rank target. An older numeric target is converted only when the season starts in Mythic, where the number unambiguously means total Mythic stars; other legacy values remain untouched for review.

The workspace JSON gains optional `push.targetRank` and match `rankCheckpoint`. Old `mythicCheckpoint` records remain readable. Old `starsBefore`/`starsAfter` yield a delta when explicit `starDelta` is absent, while explicit null stays unknown. Historical `rankTier` text remains for old exports but is not used as a new rank fact.

Deletion records the original match and reason in the existing audit array; server revision history also retains snapshots. New fields must be deployed to the validating Worker before the frontend. Old backups remain readable by the new app; older clients may reject new backups and should refresh. Existing manual source/evidence conventions remain unchanged.

Normalized rank targets and checkpoints are added by the staged checkpoint D
migration. Existing workspace snapshots and server history remain the recovery
source. The migration is applied only with the final combined release.
