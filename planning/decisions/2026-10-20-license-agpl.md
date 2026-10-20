# License: AGPL-3.0, public GitHub repo

Decided 2026-10-20 in conversation with Mihail.

## Decision
Spaternum is a public GitHub repository licensed under **AGPL-3.0**.

## Why
- A public repo with no license lets people look but legally not use or copy the code.
- Spaternum is self-hosted server software. AGPL keeps it open while requiring anyone who runs a modified version as a network service to publish their changes, so nobody can turn it into a closed hosted product.
- Same choice as similar projects (Nextcloud, Plane).
- Mihail keeps the copyright, so other options (e.g. a separate commercial license) stay open as long as he owns all the code. **Monetization is not planned** — Claude should flag it if the project reaches a point where it would make sense.

## Alternatives considered
- **MIT:** maximum freedom for others, including closing and selling it; no protection.
- **No license:** not open source at all.

## Consequences
- Easier: building in public with the code visible and protected.
- Harder: some companies avoid AGPL code, so fewer may reuse it. Outside contributions would need a contributor agreement (CLA) to keep the option of relicensing.
- A public repo means secrets, tokens and personal data never get committed.

## Related
[[PRD]] · [[2026-10-20-git-workflow]] · [[tasks]]
