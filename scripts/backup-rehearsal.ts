import { readFile } from "node:fs/promises";
import { rehearseBackup, fileSha256 } from "../packages/tracker/rehearsal";

const path = process.argv[2];
const expectedMd5 = process.argv[3];
if (!path || !expectedMd5 || !/^[a-f0-9]{32}$/.test(expectedMd5)) {
  throw new Error(
    "Usage: npx tsx scripts/backup-rehearsal.ts <local-backup.json> <PostgreSQL-MD5>",
  );
}
const bytes = await readFile(path);
const result = await rehearseBackup(JSON.parse(bytes.toString("utf8")));
if (result.postgresJsonMd5 !== expectedMd5)
  throw new Error("Source checksum mismatch; backup is not verified.");
console.log(
  JSON.stringify(
    { ...result, fileSha256: fileSha256(bytes), sourceChecksumVerified: true },
    null,
    2,
  ),
);
