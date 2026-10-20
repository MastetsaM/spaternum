# Offline: only where needed, latest write wins

Decided 2026-10-17 in conversation with Mihail.

## Decision
Only modules that need offline (voice notes first) keep a local copy and an outbox of pending changes. Conflicts resolve by newest `updated_at`. Other modules are online-only.

## Why
- Mihail accepts that some features stop working offline.
- Single user, so real conflicts are rare.

## Alternatives considered
- **Full offline sync for everything (CRDTs, sync frameworks):** roughly doubles the hard parts.
- **Online-only for everything:** voice notes would fail without signal.

## Consequences
- Easier: simple sync logic.
- Harder: an edit made on two devices at once can be lost (accepted).

## Related
[[PRD]] · [[TECH]]
