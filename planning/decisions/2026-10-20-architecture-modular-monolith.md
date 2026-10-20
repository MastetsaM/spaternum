# Architecture: hub and spoke, modular monolith server

Decided 2026-10-17 in conversation with Mihail.

## Decision
One server is the single source of truth (data, API, later AI). PC and Android apps are thin interfaces. The server is one program with one folder per feature module; each module owns its tables and routes and doesn't reach into another's internals.

## Why
- Mihail wants independent features that converge in one place.
- He prioritizes designs that are easy to understand, debug and change.
- Cross-module AI needs all data in one place.

## Alternatives considered
- **Microservices (one service per feature):** independent, but much harder to run, deploy and debug for one person.
- **Separate apps per feature:** no shared data, no cross-module AI.

## Consequences
- Easier: one deploy, one log, one database; modules can still be split out later thanks to clean boundaries.
- Harder: module boundaries are kept by discipline, not enforced by the network.

## Related
[[PRD]] · [[TECH]]
