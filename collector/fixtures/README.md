# Fixture policy

No real or anonymized FightHistory fixtures have been supplied. Existing test bytes are synthetic and are not game-format fixtures.

Everything in this directory is ignored except this policy and the manifest template. Place originals, screenshots, expected observations and identity maps under `private/`. The inspector does not sanitize anything. Follow the [research protocol](../../docs/fight-history-research.md) before adding any public fixture.

Copy `sample-manifest.example.json` into the private directory and fill only observed facts. Null means not recorded, not zero or false. This template is research metadata, not NormalizedMatchV1. Keep raw and sanitized hashes distinct. A future approved fixture must have independent expected values and evidence references; parser-generated output is not its own ground truth.
