# Collector research environment

Current implementation inspects local copied files only. `src/contracts.ts` defines replaceable source and parser interfaces; no parser is registered or implemented. `src/inspect.ts` computes SHA-256 and size without interpreting bytes. `src/cli.ts` emits diagnostic JSON and deliberately returns exit 2 for all inspected files because there is no verified parser.

```sh
npm install
npm run inspect -- "collector/fixtures/private/sample-001.bin"
npm test
```

No cloud calls, uploads, Android access, normalization or match imports take place. Output omits file paths and raw bytes. The inspector reads at most 16 MiB plus one sentinel byte; this is a tooling cap. It opens files read-only, but use stable local copies, not files still being written by the game.

Tests use synthetic bytes and known SHA-256 vectors. They do not establish MLBB compatibility. Real fixture tests will be introduced only after samples and independently recorded expectations exist. Run research outputs locally and retain originals for later parser repair.

Future implementations of `FightHistorySource` can use manual selection, SAF, ADB or Shizuku. The decoder receives only bytes. A separate normalizer will use the eventual application contract. See [sample instructions](../docs/fight-history-research.md).
