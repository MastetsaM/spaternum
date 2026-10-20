# Park phone call recording

Decided 2026-10-17 in conversation with Mihail.

## Decision
Phone call recording is not built. Speakerphone + a normal voice note is the manual fallback.

## Why
- Android 10+ blocks apps from capturing call audio.
- Mihail's Xiaomi 14T (EU build) dialer has no record button, so there's nothing to import either.
- Recording calls in Portugal requires the other party's consent (Penal Code art. 199; not legal advice).

## Alternatives considered
- **Import from the dialer's recordings:** not possible, no record button.
- **Rooting the phone:** fragile, breaks banking apps.

## Consequences
- Revisit only if the phone or OS gains a record button.

## Related
[[PRD]] · [[TECH]]
