// Notes rules that don't need the database or the screen: titles, order, search, folder tags,
// the folder tree, where a folder may move, recordings per note, and what the editor saves.

import type { Folder, Note, Recording } from "../sync/db";

/** First line of the body, without Markdown heading marks — same rule as the server. */
export function title(body: string): string {
  return body.split("\n", 1)[0].replace(/^[# ]+/, "").trim() || "(empty)";
}

/**
 * The title shown for a note: its own title, else the body's first line, else the date-time of
 * its first recording (local time), else "(empty)".
 */
export function noteTitle(note: Pick<Note, "title" | "body">, firstRecordedAt?: string | null): string {
  const shown = note.title.trim() || title(note.body);
  if (shown !== "(empty)" || !firstRecordedAt) return shown;
  return new Date(firstRecordedAt).toLocaleString();
}

/** What the editor edits and saves together. */
export type Content = { title: string; body: string };

/** Empty = no title and no body; only spaces and new lines count as empty. Never saved. */
export function isEmpty(content: Content): boolean {
  return content.title.trim() === "" && content.body.trim() === "";
}

export function sameContent(a: Content, b: Content | null): boolean {
  return b !== null && a.title === b.title && a.body === b.body;
}

/** Pinned first, then last edited first. edited_at strings all use toISOString(), so they sort as text. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.edited_at.localeCompare(a.edited_at),
  );
}

/** The folder a note shows in: its own if that folder is on the device, else the top level (null). */
export function shownFolder(folderId: string | null | undefined, folderIds: Set<string>): string | null {
  return folderId && folderIds.has(folderId) ? folderId : null;
}

/**
 * Notes whose title or body contains the text (any case), that have every chosen tag, and that
 * sit somewhere below a folder of every chosen folder tag (see folderTags).
 */
export function searchNotes(
  notes: Note[],
  text: string,
  tags: string[],
  folderTagNames: string[] = [],
  folders: Folder[] = [],
): Note[] {
  const needle = text.trim().toLowerCase();
  return notes.filter((note) => {
    if (needle && !`${note.title}\n${note.body}`.toLowerCase().includes(needle)) return false;
    if (!tags.every((tag) => note.tags.includes(tag))) return false;
    if (folderTagNames.length === 0) return true;
    const inside = folderTags(note.folder_id, folders);
    return folderTagNames.every((name) => inside.includes(name));
  });
}

/**
 * Folder tags: the names of the folders a note sits in, from the top level down
 * (`Work › Clients › Acme` → Work, Clients, Acme). Worked out from where the note is now,
 * never saved. A folder that isn't on the device ends the chain (the note shows at the top level).
 */
export function folderTags(folderId: string | null | undefined, folders: Folder[]): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  const seen = new Set<string>(); // a loop (two offline moves) must not run forever
  let folder = folderId ? byId.get(folderId) : undefined;
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    names.unshift(folder.name);
    folder = folder.parent_id ? byId.get(folder.parent_id) : undefined;
  }
  return names;
}

/** Every folder name, sorted and once each: folders with the same name are one folder tag. */
export function allFolderTags(folders: Folder[]): string[] {
  return [...new Set(folders.map((f) => f.name))].sort((a, b) => a.localeCompare(b));
}

/** The Pinned section at the top level: pinned notes from every folder, last edited first. */
export function pinnedNotes(notes: Note[]): Note[] {
  return sortNotes(notes.filter((note) => note.pinned));
}

/**
 * Each note's recordings, oldest first. A recording whose note isn't on the device (not synced
 * yet, or archived) is held back until the note arrives.
 */
export function recordingsByNote(recordings: Recording[], notes: Note[]): Map<string, Recording[]> {
  const ids = new Set(notes.map((n) => n.id));
  const out = new Map<string, Recording[]>();
  for (const rec of recordings) {
    if (!ids.has(rec.note_id)) continue;
    out.set(rec.note_id, [...(out.get(rec.note_id) ?? []), rec]);
  }
  for (const list of out.values()) list.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  return out;
}

/** Every tag in use, sorted. */
export function allTags(notes: Note[]): string[] {
  return [...new Set(notes.flatMap((note) => note.tags))].sort((a, b) => a.localeCompare(b));
}

/** Adds what was typed (one tag, or several separated by commas): trimmed, no duplicates. */
export function addTags(tags: string[], typed: string): string[] {
  const added = typed.split(",").map((tag) => tag.trim()).filter(Boolean);
  return [...new Set([...tags, ...added])];
}

export type FolderNode = { folder: Folder; depth: number };

/**
 * The folder tree as a flat list in display order (each folder followed by its sub-folders),
 * sorted by name. A folder whose parent isn't on the device shows at the top level, and so
 * does one caught in a loop (possible for a moment after two offline moves).
 */
export function folderTree(folders: Folder[]): FolderNode[] {
  const ids = new Set(folders.map((f) => f.id));
  const children = new Map<string | null, Folder[]>();
  for (const folder of folders) {
    const parent = shownFolder(folder.parent_id, ids);
    children.set(parent, [...(children.get(parent) ?? []), folder]);
  }
  const byName = (a: Folder, b: Folder) => a.name.localeCompare(b.name);

  const out: FolderNode[] = [];
  const placed = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const folder of (children.get(parent) ?? []).sort(byName)) {
      if (placed.has(folder.id)) continue;
      placed.add(folder.id);
      out.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  // Folders in a loop are never reached from the top: show them at the top level
  for (const folder of folders.filter((f) => !placed.has(f.id)).sort(byName)) {
    if (placed.has(folder.id)) continue;
    placed.add(folder.id);
    out.push({ folder, depth: 0 });
    walk(folder.id, 1);
  }
  return out;
}

/** The ids of every folder inside this one, any depth. */
/**
 * The folders shown directly inside a folder (null = top level), sorted by name.
 * Taken from the tree, so folders in a loop still show somewhere (at the top level).
 */
export function childFolders(folders: Folder[], parentId: string | null): Folder[] {
  const tree = folderTree(folders);
  if (parentId === null) return tree.filter((n) => n.depth === 0).map((n) => n.folder);
  const at = tree.findIndex((n) => n.folder.id === parentId);
  if (at < 0) return [];
  const depth = tree[at].depth;
  const out: Folder[] = [];
  for (let i = at + 1; i < tree.length && tree[i].depth > depth; i++) {
    if (tree[i].depth === depth + 1) out.push(tree[i].folder);
  }
  return out;
}

export function subFolderIds(folders: Folder[], id: string): Set<string> {
  const inside = new Set<string>();
  let added = true;
  while (added) {
    added = false;
    for (const folder of folders) {
      const parent = folder.parent_id;
      if (parent && (parent === id || inside.has(parent)) && folder.id !== id && !inside.has(folder.id)) {
        inside.add(folder.id);
        added = true;
      }
    }
  }
  return inside;
}

/** Where a folder may move: anywhere except itself and its own sub-folders (that would be a loop). */
export function moveTargets(folders: Folder[], id: string): Folder[] {
  const inside = subFolderIds(folders, id);
  return folders.filter((folder) => folder.id !== id && !inside.has(folder.id));
}

export type SaveAction = { kind: "none" } | { kind: "write"; content: Content } | { kind: "archive" };

/**
 * What the editor writes.
 * - now: what's in the boxes now
 * - saved: what's stored on the device, or null if the note has no row yet
 * - opened: what was there when the editor opened, or null for a new note
 * - leaving: true when the editor closes, false for a save while typing
 * - hasRecordings: the note holds recordings, so it isn't empty without text
 */
export function toSave(
  now: Content,
  saved: Content | null,
  opened: Content | null,
  leaving: boolean,
  hasRecordings = false,
): SaveAction {
  if (!isEmpty(now) || hasRecordings) return sameContent(now, saved) ? { kind: "none" } : { kind: "write", content: now };
  // Empty: never saved. On leaving, put back what was there before this editor changed it.
  if (!leaving || saved === null || sameContent(saved, opened)) return { kind: "none" };
  // A new note written while typing and then cleared: it shouldn't exist, so it's archived
  return opened === null ? { kind: "archive" } : { kind: "write", content: opened };
}

/**
 * Hides what's inside a folder this device archived, until the server's archive of it syncs
 * back. `archived` maps such a folder's id to its archive time (its last updated_at).
 * Only items not changed since then are hidden: a note moved or restored into it later
 * (newer updated_at) shows at the top level, like any note whose folder isn't on the device.
 * A folder in `archived` that is active again (restored) hides nothing.
 */
export function hideArchivedContents(
  folders: Folder[],
  notes: Note[],
  archived: Record<string, string>,
): { folders: Folder[]; notes: Note[] } {
  const byId = new Map(folders.map((f) => [f.id, f]));
  // Archive time of the nearest folder up the chain that isn't on the device, if this device archived it
  const archivedAbove = (folderId: string | null | undefined): string | null => {
    const seen = new Set<string>();
    let id = folderId;
    while (id && !seen.has(id)) {
      const folder = byId.get(id);
      if (!folder) return archived[id] ?? null;
      seen.add(id);
      id = folder.parent_id;
    }
    return null;
  };
  const shown = (start: string | null | undefined, updatedAt: string) => {
    const at = archivedAbove(start);
    return at === null || updatedAt > at;
  };
  return {
    folders: folders.filter((f) => shown(f.parent_id, f.updated_at)),
    notes: notes.filter((n) => shown(n.folder_id, n.updated_at)),
  };
}
