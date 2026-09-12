# Data-field validation ledger

No real samples have been received. **All fields below are uncertain/unverified.** None are confirmed or proven unavailable. This ledger describes research targets, not production columns.

Statuses: confirmed = decoded and independently compared to screens for named builds/samples; inferred = plausible interpretation with incomplete evidence; uncertain = unknown or conflicting evidence; unavailable = not obtainable in the examined scope, with attempts recorded. Confirmation is scoped, never universal across future builds.

| Field(s)                                 | Status    | Evidence required                                                                            |
| ---------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| Native battle/match ID                   | Uncertain | Uniqueness across matches, stability across repeated exports and both devices; account scope |
| Account/player IDs; teammate IDs         | Uncertain | Correct shared-account participant selection; private identity comparison                    |
| Match timestamp                          | Uncertain | Screen time and phone offset; units and start/end semantics                                  |
| Duration                                 | Uncertain | Screen duration; unit and rounding checks                                                    |
| Game mode; ranked flag; map              | Uncertain | Ranked and unranked controls; no inference from file presence                                |
| Win/loss/draw                            | Uncertain | Screen outcome from account participant perspective                                          |
| Hero ID; name mapping                    | Uncertain | Multiple heroes; mapping source and revision                                                 |
| Lane; role                               | Uncertain | Actual match assignments, not hero's typical role                                            |
| Kills; deaths; assists                   | Uncertain | Exact screen values for selected participant                                                 |
| KDA                                      | Uncertain | Determine source versus derived; specify zero-death policy                                   |
| Gold                                     | Uncertain | Exact value, display rounding and units                                                      |
| Hero damage; damage taken; turret damage | Uncertain | Detailed screens, totals versus rates                                                        |
| Healing; crowd control                   | Uncertain | Detailed screens, units and missing-value semantics                                          |
| Teamfight participation                  | Uncertain | Direct field or verified numerator/denominator; zero denominator                             |
| MVP; medal; rating/grade                 | Uncertain | MVP/non-MVP wins and losses; numeric versus categorical meaning                              |
| Items; battle spell; emblem              | Uncertain | Screen IDs/mapping and build coverage                                                        |
| Rank tier; current stars                 | Uncertain | Timestamped rank screens; whether record is pre/post-match                                   |
| Rank before; rank after                  | Uncertain | Paired screens and tier-transition examples                                                  |
| Stars before; stars after; star change   | Uncertain | Paired observations; protection/bonus-star controls                                          |
| Protection points; raising points        | Uncertain | Screens before/after, event semantics and rollover                                           |
| Star protection event; bonus-star event  | Uncertain | Visible event plus exact rank change, no result-only assumptions                             |

## Evidence entry template

For each field, append: field name, status, sample IDs, game builds, byte offset/decoded path, observed values, screen references, mismatch count, missing count, unit/timezone semantics, parser revision, reviewer/date, counterexamples and next experiment. Keep sensitive values in the private fixture ledger; publish only reviewed aliases and summaries.

## Acceptance and exclusions

10–20 representative samples are the starting validation set, not statistical proof of every game mechanic. Cross-check each required MVP field against all applicable samples. Confirmations require repeatable tests and documented coverage. Unresolved fields must remain optional/unknown and must not power analytics. Missing role, star or advanced fields do not justify fabrication.

Separately test whether locally present history actually means locally played history before treating device attribution as reliable. Capture actual human identity at match time; current device mapping is not sufficient for historical imports.

Phase 0C may proceed once the useful supported subset is demonstrated, unsupported fields are excluded, identity/deduplication policy is explicit, and parser regression tests pass. Exact ranked-star tracking remains unavailable until direct evidence or reviewed manual snapshots support it.
