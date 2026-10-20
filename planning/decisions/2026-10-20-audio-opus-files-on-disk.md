# Audio: Opus files on disk, metadata in DB

Decided 2026-10-17 in conversation with Mihail.

## Decision
Voice notes are recorded as Opus and stored as files on the server's HDD; the database stores only metadata (id, timestamps, duration, path, size, later transcript).

## Why
- Opus is small (~1 MB per 10 min of speech), free, and Whisper reads it.
- Keeps the database small and backups fast.

## Alternatives considered
- **Audio as DB blobs:** single backup, but bloats the DB.
- **MP3/AAC/WAV:** larger or less suited to speech.

## Consequences
- Easier: small files, cheap backups.
- Harder: audio folder must be backed up alongside `pg_dump`.

## Related
[[PRD]] · [[TECH]]
