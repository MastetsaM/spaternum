# Client package manager: pnpm, not Bun (for now)

Decided 2026-10-20 in conversation with Mihail.

## Decision
The Tauri/React clients use pnpm as package manager and script runner. Bun is not used.

## Why
- pnpm is already installed; Bun would be a new install.
- pnpm is very mature; Bun is younger and occasionally hits package compatibility issues.
- Tauri on Android is already the experimental part of the stack — no need for a second young tool next to it.
- Bun's speed gain is small at this project's size.

## Alternatives considered
- **Bun:** faster installs and script startup, package manager + runtime in one; supported by Tauri and `create-tauri-app`. Originally mentioned as a possible server runtime when the server was going to be TypeScript — dropped when the server became Python.

## Consequences
- Easier: nothing new to install or debug.
- Switching later is cheap: delete `pnpm-lock.yaml`, run `bun install`, update scripts/docs. Worth revisiting if install or dev-server speed becomes annoying.

## Related
[[PRD]] · [[TECH]]
