import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inspectBytes, inspectFile, MAX_SAMPLE_BYTES } from "../src/inspect.js";

test("hashes exact bytes with a known SHA-256 vector and never invents a match", () => {
  const report = inspectBytes(Buffer.from("abc"));
  assert.equal(
    report.rawHash,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(report.byteLength, 3);
  assert.equal(report.status, "parser_error");
  assert.equal(report.errorCode, "NO_VERIFIED_PARSER");
  assert.equal("match" in report, false);
});

test("empty and oversized inputs fail safely", () => {
  assert.equal(inspectBytes(new Uint8Array()).errorCode, "EMPTY_INPUT");
  assert.throws(
    () => inspectBytes(new Uint8Array(MAX_SAMPLE_BYTES + 1)),
    /limit/,
  );
});

test("hashes only the selected view without modifying input", () => {
  const input = Buffer.from("xabcx");
  assert.deepEqual(
    inspectBytes(input.subarray(1, 4)),
    inspectBytes(Buffer.from("abc")),
  );
  assert.equal(input.toString(), "xabcx");
});

test("local inspection preserves file content; missing files reject", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mlbb-research-"));
  try {
    const path = join(directory, "synthetic.bin");
    await writeFile(path, "abc");
    assert.deepEqual(await inspectFile(path), inspectBytes(Buffer.from("abc")));
    assert.deepEqual(await inspectFile(path), await inspectFile(path));
    await assert.rejects(inspectFile(join(directory, "missing")));
  } finally {
    await rm(directory, { recursive: true });
  }
});
