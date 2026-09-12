import { inspectFile } from "./inspect.js";

const args = process.argv.slice(2);
if (args.length === 0 || (args.length === 1 && args[0] === "--help")) {
  console.log(
    "Usage: npm run inspect -- <local-sample-file>\nLocal metadata only; no verified FightHistory parser exists yet.",
  );
} else if (args.length !== 1) {
  console.error("Expected exactly one local sample file.");
  process.exitCode = 1;
} else {
  try {
    const report = await inspectFile(args[0]!);
    console.log(
      JSON.stringify(
        { ...report, inspectedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
    process.exitCode = 2; // Inspected successfully, but cannot parse a match.
  } catch {
    console.error(
      "Inspection failed: file must be readable, regular, and at most 16 MiB.",
    );
    process.exitCode = 1;
  }
}
