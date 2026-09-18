# PK32 VB5 Runtime Export

- Source: `output/pk32-reference/memory-dumps/Pk32-full-memory.dmp`
- Loaded image: `0x00400000`, 33767424 bytes
- VB runtime build: 3724; forms: 6; objects: 221
- Objects with captured method tables: 1
- Objects with captured method bodies: 1
- Numbered game-module candidates: 214

## Evidence Boundary

This export recovers VB5 object metadata, named event handlers, control/event families, and whether the MiniDump actually contains each method table or body.
A named event is not recovered rule logic. Entries without captured method bodies remain migration candidates and must not be promoted to migrationComplete, verificationComplete, or originalComplete.

## Outputs

- `output/pk32-reference/vb5-runtime-export.json`: raw runtime metadata and capture status.
- `output/pk32-reference/vb5-runtime-migration-definitions.json`: event-family migration candidates.
- `output/pk32-reference/unpacked/Pk32-runtime-image.bin`: optional loaded-image reconstruction.
