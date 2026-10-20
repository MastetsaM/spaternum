# Access: Tailscale + single API token

Decided 2026-10-17 in conversation with Mihail.

## Decision
The server is reachable only over Tailscale. Clients send one API token in the `Authorization` header. No user accounts.

## Why
- Single user (Mihail), maybe published on git later.
- Tailscale already runs on the Pi.

## Alternatives considered
- **User accounts / OAuth:** needed only for multi-user; unnecessary complexity now.
- **Exposing the server to the internet:** bigger attack surface.

## Consequences
- Easier: almost no auth code.
- Harder: going multi-user later would need real accounts added.

## Related
[[PRD]] · [[TECH]]
