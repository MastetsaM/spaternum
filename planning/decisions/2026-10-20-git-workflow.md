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

## Addition 2026-10-28: parallel branches
- When blocks don't depend on each other, they can be built at the same time. Each one gets its own branch in its own git worktree (`.claude/worktrees/`, ignored by git), so the builds don't switch branches under each other.
- Changes to shared files (routes, layout, CSS, the sync code) stay small, and conflicts are resolved at merge.
- For device testing, the finished branches are merged into one combined branch (`feature/phase1-client`), and one APK is built from it. The combined branch goes to `main` once the device checks pass.

## Addition 2026-11-22: tooling straight to main
- Tooling that doesn't change the app or the server (build scripts, Claude skills) can go straight to `main` in small commits. The branch rule protects what the Pi runs, and this tooling never touches it (Mihail, 2026-11-22).

## Addition 2026-11-26: merge before the device check
- Device checks always run against the Pi, and the Pi runs only `main`. So a feature branch is merged into `main` once it's built, its automated tests pass and the code matches its spec, **before** the device check. Then `main` is pushed, the Pi updated, and the phone and PC get the app from `main`.
- Anything the device check finds is fixed on a `fix/…` branch.
- Why: testing against the Pi is faster for Mihail and needs no change of server address in the app's settings (Mihail, 2026-11-26). It replaces the one-off exception used for notes with recordings.
- Cost: `main` can briefly hold a feature that hasn't passed its device check yet.

## Related
[[PRD]] · [[TECH]] · [[tasks]]
