# Local files: app storage on Android, ~/Documents/Spaternum on the PC

Decided 2026-10-21 in conversation with Mihail.

## Decision
- **What counts as a "file":** voice-note audio, exports, later code-editor files. Notes and all metadata are not files — they live in RxDB's local database, which the webview keeps in its own storage (location not ours to choose).
- **Android:** files go in the app's **private storage**. No permissions, not visible in the file manager, deleted on uninstall.
- **PC:** files go in **`~/Documents/Spaternum/`**, one sub-folder per module (`voice-notes/`, `exports/`, …), so they're visible and usable outside the app.
- **Voice-note audio on a device is temporary.** The local copy is deleted only when all three are true:
  1. the server has the file (upload confirmed),
  2. the server has transcribed it (phase 2),
  3. **Mihail has validated the transcript.**
  Until then it stays on the device. Before phase 2 there are no transcripts, so audio stays on the device. Pressing Play on a recording whose local copy is gone streams it from the server.
  The manual validation step may be removed later, once transcripts prove reliable.
- All file access still goes through one file interface ([[2026-10-20-local-files-behind-interface]]).

## Why
- The server is the source of truth and the backup; devices only need a working copy ([[2026-10-21-sync-rxdb]]).
- Mihail wants `Documents/Spaternum` on the PC to keep it organised and reach files outside the app; on the PC that costs nothing.
- On Android, direct writes to `Documents/` are blocked (phase 0, [[voice-recorder-prototype_spec]]); app storage works today with no permissions or native code.
- Keeping audio until the transcript is validated means a bad or failed transcription can always be redone from the original.

## Alternatives considered
- **"All files access" on Android:** visible files with one manifest line, but grants access to all storage. Not needed now.
- **Storage Access Framework (user picks the folder once):** liked by Mihail; the proper Android way to get visible files. Not now: more code, and unsure whether Tauri's plugins support folder picking on Android (may need a native plugin). **Planned upgrade** if visible files on the phone become important.
- **MediaStore:** visible, but native code, and files may become unreadable to the app after a reinstall.
- **Keep all audio on the device after upload:** offline playback of old recordings, but storage grows (~240 KB/min). Mihail doesn't need everything on the device as long as it's backed up and processed.
- **Delete right after upload:** smallest storage, but a failed transcription would depend on the server copy alone.

## Consequences
- Easier: no permissions, no native code, device storage stays small once transcripts are validated.
- Harder: recordings not yet uploaded are lost if the app is uninstalled — the app must show which recordings aren't uploaded yet. Older recordings can't be played offline (metadata and transcripts still can be seen). Phase 2 needs a "validate transcript" action.
- Later: Markdown export of notes to `~/Documents/Spaternum/notes/` ([[notes_spec]]); possible move to SAF on Android; possibly drop manual transcript validation.

## Related
[[2026-10-20-local-files-behind-interface]] · [[2026-10-21-sync-rxdb]] · [[voice-recorder-prototype_spec]] · [[notes_spec]] · [[TECH]] · [[risks]] · [[tasks]]
