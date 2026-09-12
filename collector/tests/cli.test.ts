import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const run = (...args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", cli, ...args], {
    encoding: "utf8",
  });

test("CLI help succeeds and invalid usage fails", () => {
  assert.equal(run("--help").status, 0);
  assert.equal(run("one", "two").status, 1);
});

test("CLI returns non-success for unparsed bytes and does not reveal paths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mlbb-cli-"));
  try {
    const path = join(directory, "private-account-name.bin");
    await writeFile(path, "abc");
    const result = run(path);
    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(report.status, "parser_error");
    assert.equal(report.errorCode, "NO_VERIFIED_PARSER");
    assert.equal(result.stdout.includes("private-account-name"), false);
    assert.equal(result.stderr, "");
    const missing = run(join(directory, "sensitive-missing-name"));
    assert.equal(missing.status, 1);
    assert.equal(missing.stderr.includes(directory), false);
  } finally {
    await rm(directory, { recursive: true });
  }
});
