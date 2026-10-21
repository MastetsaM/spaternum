# Code editor files stay on the PC, behind an interface

Decided 2026-10-17 in conversation with Mihail.

## Decision
The code editor module works on files on the PC. All file access goes through one small interface (`list / read / write / watch`).

## Why
- Mihail keeps code locally and uses git.
- He may want files on the server later.

## Alternatives considered
- **Files on the server, edited remotely:** central, but needs connectivity and a sync story.

## Consequences
- Easier: moving files to the server later = one new implementation of the interface.
- Harder: must avoid direct `fs` calls in UI code.

Where files live (2026-10-21): [[2026-10-21-local-files-location]].

## Related
[[PRD]] · [[TECH]]
