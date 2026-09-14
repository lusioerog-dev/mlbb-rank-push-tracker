# Rank rules and season setup

Reviewed 2026-09-13. The versioned configuration and rank transitions live in `packages/tracker/rank-rules.ts`; selectors in `model.ts` are shared by manual entry and future ingestion.

## Evidence and limits

[Google Play's rank guide](https://play.google.com/store/apps/editorial?hl=en&id=mc_games_editorialevergreen_postinstall_how_ranks_work_in_mobile_legends_fcp) describes the lower divisions and star requirements. [Dot Esports' ranking guide](https://dotesports.com/mobile-legends/news/mlbb-ranks-tiers-rewards) describes the full ladder and promotion from Epic I at five stars on the next win. [Apple's game editorial](https://apps.apple.com/ar/iphone/story/id1706942214?l=en-GB) confirms the Mythic star system and Immortal at 100 stars.

Configuration: Warrior III–I, three stars; Elite III–I, four; Master IV–I, four; Grandmaster/Epic/Legend V–I, five. Mythic uses a continuous count, with Honor at 25, Glory at 50 and Immortal at 100. Recorded actual deltas include bonuses and protection; never infer a delta solely from victory or defeat. Lower division promotion carries one star into the next division; loss below zero moves to the previous division with one fewer than its full star count.

No reliably verified current season-reset mapping was found. `resetMapping` deliberately remains null. Select the actual post-reset rank, division and stars in Settings once before recording the new season. Do not predict the reset from last season's peak.

Mythic placement awards and demotion below Mythic zero are not safely established by the sources. The engine returns an unknown rank at those boundaries rather than inventing an award. Placement remains visibly pending until a match records the confirmed result, its source and confirmation time. A confirmed rank checkpoint can resume calculation after placement or any other unknown gap. Correcting a checkpoint retains its earlier value and recalculates every later match. These are explicit limits, not claims of fully automated handling of every game rule.

## Calculations

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
