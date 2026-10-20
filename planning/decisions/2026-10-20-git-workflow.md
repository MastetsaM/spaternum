# Git workflow: feature branches, small commits, merge when complete

Decided 2026-10-20 in conversation with Mihail.

## Decision
- The project lives in git from the start.
- Each feature is built on its own branch off `main`.
- Work is committed one step at a time: small commits, each one a single coherent change.
- Branches are named by type: `feature/<name>`, `fix/<name>`, `docs/<name>`.
- A feature branch is merged into `main` only when the feature is complete: its spec's acceptance criteria are met **and its tests pass**. Exception: throwaway prototypes, where the spec's manual checks are the test.
- `main` therefore only ever holds finished features.

## Why
- Small commits make each change easy to review, understand and undo.
- Keeping `main` clean means it always works, which matters once the server runs from it.

## Alternatives considered
- **Committing straight to `main`:** simpler, but unfinished work ends up in the branch everything runs from.
- **Large commits per feature:** fewer commits, but hard to review or partially revert.

## Consequences
- Easier: rollbacks, reading history, building in public (each commit is a visible step).
- Harder: a bit more branch handling.

Repo: public on GitHub, license AGPL-3.0 — see [[2026-10-20-license-agpl]].

## Related
[[PRD]] · [[TECH]] · [[tasks]]
