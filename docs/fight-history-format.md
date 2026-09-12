# FightHistory format investigation

Status: unverified; no samples received. This is the future location of the Phase 0B parsing report, not a format specification.

| Question                                     | Current finding |
| -------------------------------------------- | --------------- |
| Signature, endianness, encoding, compression | Unknown         |
| Header, record boundaries, checksums         | Unknown         |
| One versus multiple battles per file         | Unknown         |
| Supported game builds                        | None            |
| Timestamp unit and timezone                  | Unknown         |
| Battle ID scope and stability                | Unknown         |
| Local-only history versus account sync       | Unknown         |
| Rank and exact star availability             | Unknown         |

For every future layout entry record byte offset/path, primitive type, length constraints, interpretation, supporting sample IDs, tested builds and counterexamples. Separate observed bytes from inferred semantics. Do not ship an offset without a regression fixture and bounds checks. See [research plan](fight-history-research.md) for evidence collection.
