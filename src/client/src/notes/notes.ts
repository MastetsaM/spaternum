// Notes rules that don't need the database or the screen: titles, order, search,
// the folder tree, where a folder may move, and what the editor saves.

import type { Folder, Note } from "../sync/db";

/** First line of the body, without Markdown heading marks — same rule as the server. */
export function title(body: string): string {
  return body.split("\n", 1)[0].replace(/^[# ]+/, "").trim() || "(empty)";
}

/** The title shown for a note: its own title, or the body's first line when that's empty. */
export function noteTitle(note: Pick<Note, "title" | "body">): string {
  return note.title.trim() || title(note.body);
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

/** Pinned first, then last edited first. updated_at strings all use toISOString(), so they sort as text. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at),
  );
}

/** The folder a note shows in: its own if that folder is on the device, else the top level (null). */
export function shownFolder(folderId: string | null | undefined, folderIds: Set<string>): string | null {
  return folderId && folderIds.has(folderId) ? folderId : null;
}

/** Notes whose title or body contains the text (any case) and that have every chosen tag. */
export function searchNotes(notes: Note[], text: string, tags: string[]): Note[] {
  const needle = text.trim().toLowerCase();
  return notes.filter(
    (note) =>
      (!needle || `${note.title}\n${note.body}`.toLowerCase().includes(needle)) &&
      tags.every((tag) => note.tags.includes(tag)),
  );
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
 */
export function toSave(now: Content, saved: Content | null, opened: Content | null, leaving: boolean): SaveAction {
  if (!isEmpty(now)) return sameContent(now, saved) ? { kind: "none" } : { kind: "write", content: now };
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
