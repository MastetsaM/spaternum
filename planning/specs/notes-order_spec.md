# Spec — Notes order (edited time)

## What and why
The note list sorts pinned notes first, then the rest by **last edited first** ([[notes_spec]]). Today "last edited" is `updated_at`, and every write sets that time: pin, a tag, a move, a restore. So a note you pin or tag jumps to the top as if you had written in it.

`updated_at` has to change on every write, because sync uses it to pick the winner ([[2026-10-20-offline-latest-write-wins]]). So the list gets its own time, `edited_at`, which changes only when the note's content changes.

## Data model
One new column on `notes` (server migration `004_note_edited_at.sql`):

```sql
ALTER TABLE notes ADD COLUMN edited_at timestamptz;
UPDATE notes SET edited_at = updated_at;
ALTER TABLE notes ALTER COLUMN edited_at SET NOT NULL;
```

- Existing notes get `edited_at = updated_at`, so today's order stays the same.
- It's written by the client like any other field (not server-owned). It's a required field in the push, so an old app that doesn't send it is refused rather than wiping it.
- **Client database:** the RxDB `notes` schema goes to version 2, with a migration that sets `edited_at = updated_at` on every stored note.

## Rules
`edited_at` is set (to `serverNow()`, the same time as `updated_at`) when:
- a new note is created
- the title or the text changes
- a recording is added to the note (Record inside it, or Record in the list)

It is **not** changed by:
- pin and unpin
- adding or removing tags
- moving the note to another folder
- archiving or restoring the note (the server's restore sets only `updated_at`)
- archiving one of its recordings
- the upload of a recording finishing

Sort order everywhere notes are listed (a folder, the Pinned section, the tree in the tool panel): pinned first where that applies, then `edited_at`, newest first.

## Inputs and outputs
- **Input:** the same writes as today.
- **Output:** a note list that moves a note only when its content changed; `edited_at` synced to every device.

## Acceptance criteria (done when…)
1. Writing in a note (title or text) moves it to the top of its folder's list, below the pinned notes.
2. Recording inside a note moves it to the top, as today ([[notes-recordings_spec]] criterion 3).
3. Pinning, unpinning, tagging and moving a note leave it at its place in the "last edited" order.
4. A note restored from the Archive page comes back at its old place in the order, not at the top.
5. After the update, existing notes are in the same order as before.
6. Sync still works: an edit on one device moves the note on the other device too; a later pin on the other device doesn't move it.
7. Tests pass: server migration (existing rows get `edited_at = updated_at`), push refuses a note without `edited_at`, restore leaves `edited_at` alone; client rules (which writes set `edited_at`, the sort), RxDB migration v1 → v2.

## Edge cases and failure modes
- **Old app talking to the new server** (a device not updated yet): its note pushes are refused, so the red sync line shows. The Pi, the phone and the PC are updated together, as with [[notes-recordings_spec]].
- **Note changes not pushed before the app updates:** kept. The RxDB migration only adds the field; the pending changes are pushed after it with `edited_at` set.
- **Pin on one device and edit on the other at the same time:** latest write wins as today, for the whole note. Whichever wins, its `edited_at` comes with it.
- **Two notes with the same `edited_at`:** order between them is not fixed (same as today).

## Out of scope
- Showing the edited time in the UI.
- Any other sort options (by name, by created time).
- Edited time for folders (they're sorted by name).

## Open questions
- A restored note keeps its old place (criterion 4), it doesn't come back at the top. Proposed, to confirm with Mihail.
- Archiving one of a note's recordings doesn't move the note. Proposed, to confirm with Mihail.

## Related
[[notes_spec]] · [[notes-recordings_spec]] · [[tasks]] · [[2026-10-20-offline-latest-write-wins]] · [[2026-10-21-sync-rxdb]]
