// The tool panel's top for Notes (notes-recordings_spec.md): the notes settings placeholder, then
// the full tree of folders and the notes inside them. Each folder opens and closes on its own;
// a tap on a name opens the folder or the note.

import { ChevronDown, ChevronRight, FileText, Folder as FolderIcon, Mic } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { childFolders, noteTitle, shownFolder, sortNotes } from "../notes/notes";
import type { Folder, Note, Recording } from "../sync/db";

export const listUrl = (folderId: string | null) => (folderId ? `/tools/notes?folder=${folderId}` : "/tools/notes");

/** Empty for now: settings are added when a real need comes up (decided 2026-11-22). */
export function NotesSettings() {
  return (
    <>
      <h3 className="panel-label">Notes settings</h3>
      <p className="muted panel-empty">Nothing to set yet.</p>
    </>
  );
}

// Which folders are open, kept while the app runs, so going between the list and a note
// doesn't close them
const openFolders = new Set<string>();

type Props = {
  folders: Folder[];
  notes: Note[];
  byNote: Map<string, Recording[]>;
  currentFolderId: string | null;
  currentNoteId?: string;
};

export function NotesTree({ folders, notes, byNote, currentFolderId, currentNoteId }: Props) {
  const [, redraw] = useState(0);
  const folderIds = new Set(folders.map((f) => f.id));

  // The path to the current folder is open, so the current place is always visible
  for (let id: string | null = currentFolderId; id; ) {
    openFolders.add(id);
    id = shownFolder(folders.find((f) => f.id === id)?.parent_id, folderIds);
  }

  const toggle = (id: string) => {
    if (openFolders.has(id)) openFolders.delete(id);
    else openFolders.add(id);
    redraw((n) => n + 1);
  };
  const notesIn = (folderId: string | null) =>
    sortNotes(notes.filter((n) => shownFolder(n.folder_id, folderIds) === folderId));

  const noteRow = (note: Note, depth: number) => (
    <li key={note.id} style={{ paddingLeft: depth * 14 + 18 }}>
      <Link to={`/tools/notes/${note.id}`} className={note.id === currentNoteId ? "active" : ""}>
        {byNote.has(note.id) ? <Mic size={14} /> : <FileText size={14} />}
        <span>{noteTitle(note, byNote.get(note.id)?.[0]?.recorded_at)}</span>
      </Link>
    </li>
  );

  const folderRows = (parentId: string | null, depth: number): ReactNode[] =>
    childFolders(folders, parentId).flatMap((folder) => {
      const open = openFolders.has(folder.id);
      return [
        <li key={folder.id} style={{ paddingLeft: depth * 14 }} className="tree-folder">
          <button className="icon" onClick={() => toggle(folder.id)} aria-label={open ? "Close folder" : "Open folder"}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <Link to={listUrl(folder.id)} className={folder.id === currentFolderId && !currentNoteId ? "active" : ""}>
            <FolderIcon size={15} /> <span>{folder.name}</span>
          </Link>
        </li>,
        ...(open ? [...folderRows(folder.id, depth + 1), ...notesIn(folder.id).map((n) => noteRow(n, depth + 1))] : []),
      ];
    });

  return (
    <>
      <h3 className="panel-label">All notes</h3>
      <ul className="folder-tree notes-tree">
        <li>
          <Link to={listUrl(null)} className={currentFolderId === null && !currentNoteId ? "active" : ""}>
            Top level
          </Link>
        </li>
        {folderRows(null, 0)}
        {notesIn(null).map((n) => noteRow(n, 0))}
      </ul>
    </>
  );
}
