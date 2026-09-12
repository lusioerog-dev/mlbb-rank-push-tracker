import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

// A research resource limit, not a claim about FightHistory file sizes.
export const MAX_SAMPLE_BYTES = 16 * 1024 * 1024;

export function inspectBytes(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_SAMPLE_BYTES) {
    throw new Error("Sample exceeds the 16 MiB research limit.");
  }
  return {
    reportVersion: 1 as const,
    toolVersion: "0.0.0",
    rawHash: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.byteLength,
    status: "parser_error" as const,
    errorCode: bytes.byteLength === 0 ? "EMPTY_INPUT" : "NO_VERIFIED_PARSER",
    warnings: [
      "No match fields decoded. This report is not an import payload.",
    ],
  };
}

export async function inspectFile(path: string) {
  const file = await open(path, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error("Expected a regular file.");
    if (stat.size > MAX_SAMPLE_BYTES)
      throw new Error("Sample exceeds the 16 MiB research limit.");
    // Bound the read even if a live file grows after stat(). Work from copies.
    const buffer = Buffer.alloc(MAX_SAMPLE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    return inspectBytes(buffer.subarray(0, length));
  } finally {
    await file.close();
  }
}
