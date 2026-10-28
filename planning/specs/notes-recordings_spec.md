# Spec — Notes with recordings (draft)

**Status:** draft, 2026-10-28. Build starts after the phase 1 phone checks pass and `feature/phase1-client` is merged into main (Mihail, 2026-10-28).

## What and why
Notes and voice notes are both notes. They become **one item, the note**, which can hold text, recordings, or both. Later phases (transcription, analysis) then work on one thing: a note's transcripts sit next to its text, under the same title, tags and folder. Asked for by Mihail on 2026-10-28, after using phase 1 on both devices.

## Decisions (Mihail, 2026-10-28)
1. A note can have **several recordings** (e.g. a follow-up recorded into the same note).
2. **Record** in the notes list makes a **new note** holding the recording. Record **inside an open note** adds a recording to that note.
3. **Title, tags, folder and pin belong to the note.** Recordings no longer have their own title and tags. Each existing voice note becomes a note holding its recording, with the voice note's title and tags.
4. **Pinned:** one **"Pinned" section at the top level** of Notes, with the pinned notes from all folders.
5. **Folder tags:** a note in `Work › Clients › Acme` also shows the tags `Work`, `Clients`, `Acme`, and choosing one in search finds everything under that folder at any depth. They are **worked out on the fly** from where the note is now, never saved, so moving or renaming a folder updates them at once. They look different from normal tags.
6. The separate **Voice notes tool goes away**.
7. **Tool panel (right):** a full tree of everything, with folders and the notes inside them, so the whole layout can be seen and navigated from one place. At its top sits a place for **notes settings** (added 2026-10-28).

## What stays the same
Everything about recording and audio in [[voice-notes_spec]]: the recorder settings, crash safety and recovery, the 1-hour split, upload, playback, the player, the file names, and that recording is Android only. Sync, archive and empty-note rules from [[notes_spec]].

## Proposed shape (to confirm before building)
- The `voice_notes` table becomes the note's **recordings**: one row per audio file, with a new `note_id`. Its `title` and `tags` move to the note in the migration.
- An "empty" note is now: no title, no text **and no recordings**. A note with only a recording is fine.
- A recording's row can reach a device before its note (they sync separately). It's then held back until the note arrives, the same way a note waits for its folder.
- Archiving a note archives its recordings with it, and restoring brings them back (like a folder and its contents).

## Open questions
- Which module owns recordings: notes, or voice notes as a part notes uses? This affects [[2026-10-20-architecture-modular-monolith]].
- Where recordings show in the note: above or below the text?
- Notes settings: what goes in them?
- Notes list row: does a note with recordings show a mark (e.g. a mic icon) next to its title?

## Out of scope
- Transcription and analysis (phases 2–3), beyond keeping room for them.
- Recording on the PC.

## Related
[[notes_spec]] · [[voice-notes_spec]] · [[archive_spec]] · [[ui-design_spec]] · [[PRD]] · [[tasks]] · [[2026-10-20-architecture-modular-monolith]]
