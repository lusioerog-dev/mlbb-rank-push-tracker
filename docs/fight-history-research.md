# FightHistory research plan

## Evidence status

As of 2026-09-12: zero real samples, zero decoded fields, zero screen comparisons. No binary layout, timestamp units, account locality, native ID or star semantics is verified. An upstream feature claim is not evidence for our game build.

## Sources checked

- [Amethyst666/mlbb-history-analyst](https://github.com/Amethyst666/mlbb-history-analyst), README reviewed 2026-09-12: advertises binary-history parsing and warns that game updates can invalidate results. It suggests `Android/data/com.mobile.legends/files/dragon2017/FightHistory` (alternate package `com.mobilelegends.hwag`). Treat these as candidate paths only. No parser code was copied or validated. Before studying code, record exact commit SHA, relevant paths and license obligations.
- [Android SAF documentation](https://developer.android.com/training/data-storage/shared/documents-files), reviewed 2026-09-12: Android 11+ restricts picker access to `Android/data` and its subdirectories. The reference README's SAF instructions therefore cannot be promised to work. Determine access empirically per phone. Shizuku/ADB access remains untested here.

No cloud quota or Android bypass claims are necessary for this phase. Verify current official provider and Shizuku documentation when implementing those integrations.

## Samples needed

Collect 10–20 real match samples across both phones, paired with actual post-match/history screenshots or careful screen transcriptions:

- Wins and losses, multiple heroes and observed lanes/roles, short and long games, MVP and non-MVP.
- Primarily ranked; include at least one unranked comparison if available to verify mode discrimination.
- Rank/star screens before and after each match where possible, including protection, bonus-star or raising events and tier transitions when naturally available. Mark missing cases explicitly; do not fabricate them.
- At least one sequence of consecutive matches on each phone. Check whether the same battle appears on the other phone without playing it there. If practical, record one intentional player/device swap to validate mapping assumptions.
- Retain one identical duplicate copy for deduplication testing. It does not count toward 10–20 distinct matches.

For each sample record: anonymous sample ID, device alias, actual human alias, game build/version, package/distribution, Android version, access method, local capture time with UTC offset, phone timezone, original file name/path privately, file modification time (not assumed to be match time), and linked screen evidence. Note whether the match was played on that phone and whether the account had been opened on the other phone.

## Read-only collection

1. Finish a normal match and capture result/history and rank evidence. Never automate gameplay.
2. Using an access method already available on the phone, copy the suspected FightHistory file(s) to a private local folder. Candidate paths above are unverified; record the actual path. Do not edit, delete, rename or change permissions of the game's originals. Do not enable root just for this task.
3. If files cannot be matched to games, keep a timestamped folder snapshot with notes; do not assume one file equals one match. Copy after writing has settled and compare repeated hashes if uncertain.
4. Put copies in `collector/fixtures/private/` or `research-private/`, both ignored. Use the manifest template for each sample and run `npm run inspect -- <copy>` for a hash and byte count. Keep the original byte hash with the private manifest. Inspection is not parsing.
5. Keep a separate private backup. Do not publish raw files or screenshots; they may contain account and teammate identifiers.

## Anonymization and golden fixtures

Do not blindly replace bytes in an unknown binary: that can corrupt lengths, checksums or identity relationships. Originals remain private until layout and identifier locations are understood. Redact screen names, account IDs, avatars and unrelated personal information while retaining required game evidence. Use consistent aliases; retain the alias key privately.

Once decoding works, produce a reviewed, structure-preserving sanitization procedure, record its version and changed fields, hash original and sanitized copies separately, then reparse and compare every non-redacted verified value. Opaque binary regions may still contain identifiers; decoding some names does not prove anonymization. If safe sanitization cannot be demonstrated, use private real-sample tests and publish only synthetic structural fixtures clearly labeled synthetic.

Each approved fixture needs binary bytes, expected observed fields, per-field evidence references, game build, parser revision, provenance and review status. Expected values must come from screen evidence, not be generated from parser output. Explicitly unignore only reviewed files; never force-add the private directory.

## Phase 0B workflow and exit criteria

Inventory hashes/duplicates -> inspect structure -> pin and study reference code -> identify format signatures/bounds -> implement smallest decoder -> emit private readable observations -> compare to screens -> update field ledger -> anonymize/revalidate -> add golden and malformed-input regression tests.

Test truncated/corrupt/unknown revisions, repeated files, account selection, timestamps/units and each verified field. A changed layout must fail safely, not silently shift offsets. Coverage gaps remain documented. The validation report must distinguish confirmed, inferred, uncertain and unavailable fields and specify build/sample coverage. Only then propose and test NormalizedMatchV1 with Zod in Phase 0C.

## Ranked-star recommendation (provisional)

Until direct values are verified, capture manual account rank snapshots tied to visible screens and timestamps. Store original tier/stars and provenance. Attribute per-match change only when comparable before/after observations bracket that match without intervening games, reset or tier ambiguity. Otherwise leave per-match stars unknown. Never spread a session total across players or convert wins/losses into authoritative stars. Screenshots may later assist entry but require review; continuous tier conversion needs separately verified rules.
