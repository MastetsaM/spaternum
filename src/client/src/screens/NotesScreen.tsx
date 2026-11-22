// Notes: folders browsed like a file manager in the main area (Pinned at the top level, sub-folders,
// then notes), or the editor with the note's recordings above its text. The tool panel holds the
// notes settings, the full tree, then the folder's or note's details. Rules live in notes/notes.ts,
// database writes in notes/store.ts, recordings in notes/recordings/ and NoteRecordings.tsx.

import { ArrowLeft, ChevronLeft, Folder as FolderIcon, FolderPlus, Mic, Pin, PinOff, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Layout } from "../layout/Layout";
import {
  addTags,
  allFolderTags,
  allTags,
  childFolders,
  folderTags,
  folderTree,
  moveTargets,
  noteTitle,
  pinnedNotes,
  recordingsByNote,
  sameContent,
  searchNotes,
  shownFolder,
  sortNotes,
  subFolderIds,
  title,
  toSave,
  type Content,
  type SaveAction,
} from "../notes/notes";
import {
  archiveFolder,
  archiveNote,
  createFolder,
  newNote,
  saveContent,
  updateFolder,
  updateNote,
  useNotesAndFolders,
  useRecordings,
} from "../notes/store";
import { getDb, type Folder, type Note, type Recording } from "../sync/db";
import { RecordButton, RecordingList, RECORDS_HERE } from "./NoteRecordings";
import { listUrl, NotesSettings, NotesTree } from "./NotesTree";

const NO_RECORDINGS: Recording[] = [];

/** /tools/notes → the list; /tools/notes/<id> → the editor. */
export function NotesScreen() {
  const { noteId } = useParams();
  return noteId ? <EditorView key={noteId} id={noteId} /> : <ListView />;
}

// ---- List ----

function ListView() {
  const data = useNotesAndFolders();
  const recordings = useRecordings() ?? NO_RECORDINGS;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [naming, setNaming] = useState(false); // the New folder name box is open
  const text = params.get("q") ?? "";
  const tags = params.getAll("tag");
  const folderTagNames = params.getAll("ftag"); // folder tags: everything below folders with that name

  if (!data) {
    return (
      <Layout title="Notes">
        <p className="muted">Loading…</p>
      </Layout>
    );
  }

  const { notes, folders } = data;
  const byNote = recordingsByNote(recordings, notes);
  const folderIds = new Set(folders.map((f) => f.id));
  const current = folders.find((f) => f.id === params.get("folder")) ?? null;
  const searching = text.trim() !== "" || tags.length > 0 || folderTagNames.length > 0;
  const shown = sortNotes(
    searching
      ? searchNotes(notes, text, tags, folderTagNames, folders)
      : notes.filter((n) => shownFolder(n.folder_id, folderIds) === (current?.id ?? null)),
  );
  const pinned = !current && !searching ? pinnedNotes(notes) : [];

  // Search lives in the URL, so the back gesture from a note returns to the same results
  const setSearch = (nextText: string, nextTags: string[], nextFolderTags = folderTagNames) => {
    const next = new URLSearchParams();
    if (current) next.set("folder", current.id);
    if (nextText) next.set("q", nextText);
    nextTags.forEach((tag) => next.append("tag", tag));
    nextFolderTags.forEach((name) => next.append("ftag", name));
    setParams(next, { replace: true });
  };
  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((t) => t !== item) : [...list, item]);
  const toggleTag = (tag: string) => setSearch(text, toggle(tags, tag));
  const toggleFolderTag = (name: string) => setSearch(text, tags, toggle(folderTagNames, name));

  const parentId = current ? shownFolder(current.parent_id, folderIds) : null;
  const parentName = folders.find((f) => f.id === parentId)?.name ?? "Notes";
  const subFolders = searching ? [] : childFolders(folders, current?.id ?? null);

  const openNew = () => {
    const folder = current ? `&folder=${current.id}` : "";
    navigate(`/tools/notes/${crypto.randomUUID()}?new=1${folder}`);
  };

  return (
    <Layout
      title="Notes"
      tools={
        <>
          <NotesSettings />
          <NotesTree folders={folders} notes={notes} byNote={byNote} currentFolderId={current?.id ?? null} />
          {current && <FolderDetails key={current.id} folder={current} folders={folders} notes={notes} />}
        </>
      }
    >
      {current && !searching && (
        <div className="location">
          <Link className="up" to={listUrl(parentId)}>
            <ChevronLeft size={16} /> {parentName}
          </Link>
          <strong>{current.name}</strong>
        </div>
      )}

      <div className="new-buttons">
        <button onClick={openNew}>
          <Plus size={16} /> New note
        </button>
        <button onClick={() => setNaming(!naming)}>
          <FolderPlus size={16} /> New folder
        </button>
        {/* A new note holding the recording, created at Stop in this folder */}
        {RECORDS_HERE && <RecordButton target={() => ({ noteId: crypto.randomUUID(), folderId: current?.id ?? null })} />}
      </div>
      {naming && (
        <NameForm
          label="Create"
          onSave={(name) => {
            createFolder(name, current?.id ?? null);
            setNaming(false);
          }}
        />
      )}

      <div className="note-search">
        <label className="search-box">
          <Search size={16} />
          <input value={text} placeholder="Search notes" onChange={(e) => setSearch(e.target.value, tags)} />
          {text && (
            <button type="button" className="icon" onClick={() => setSearch("", tags)} aria-label="Clear">
              <X size={16} />
            </button>
          )}
        </label>
        <div className="tags">
          {allTags(notes).map((tag) => (
            <button key={tag} className={`tag ${tags.includes(tag) ? "on" : ""}`} onClick={() => toggleTag(tag)}>
              {tag}
            </button>
          ))}
          {allFolderTags(folders).map((name) => (
            <button
              key={`folder:${name}`}
              className={`tag folder-tag ${folderTagNames.includes(name) ? "on" : ""}`}
              onClick={() => toggleFolderTag(name)}
            >
              <FolderIcon size={12} /> {name}
            </button>
          ))}
        </div>
      </div>

      {pinned.length > 0 && (
        <>
          <h3 className="panel-label">Pinned</h3>
          <ul className="note-list pinned-list">
            {pinned.map((note) => (
              <NoteRow key={note.id} note={note} recordings={byNote.get(note.id)} />
            ))}
          </ul>
        </>
      )}

      {subFolders.length > 0 && (
        <ul className="note-list">
          {subFolders.map((folder) => (
            <li key={folder.id}>
              <Link to={listUrl(folder.id)} className="folder-row">
                <FolderIcon size={16} /> {folder.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {shown.length === 0 ? (
        subFolders.length === 0 && <p className="muted">{searching ? "No notes match." : "Nothing here yet."}</p>
      ) : (
        <ul className="note-list">
          {shown.map((note) => (
            <NoteRow key={note.id} note={note} recordings={byNote.get(note.id)} />
          ))}
        </ul>
      )}
    </Layout>
  );
}

/** Only the title, on one line, with a mic if the note has recordings; a tap opens the note. */
function NoteRow({ note, recordings }: { note: Note; recordings?: Recording[] }) {
  return (
    <li>
      <Link to={`/tools/notes/${note.id}`} className="note-title">
        {note.pinned && <Pin size={14} />}
        <span>{noteTitle(note, recordings?.[0]?.recorded_at)}</span>
        {recordings && <Mic size={14} className="mic-mark" aria-label="Has recordings" />}
      </Link>
    </li>
  );
}

// ---- Folders ----

/** Folder options for a <select>, indented by depth, top level first. */
function FolderOptions({ folders }: { folders: Folder[] }) {
  return (
    <>
      <option value="">Top level</option>
      {folderTree(folders).map(({ folder, depth }) => (
        <option key={folder.id} value={folder.id}>
          {"  ".repeat(depth) + folder.name}
        </option>
      ))}
    </>
  );
}

/** One text box + button that hands over a trimmed, non-empty name. */
function NameForm({ label, initial = "", onSave }: { label: string; initial?: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === initial) return;
    onSave(trimmed);
    if (!initial) setName("");
  };
  return (
    <form className="name-form" onSubmit={submit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <button disabled={!name.trim() || name.trim() === initial}>{label}</button>
    </form>
  );
}

function FolderDetails({ folder, folders, notes }: { folder: Folder; folders: Folder[]; notes: Note[] }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  const folderIds = new Set(folders.map((f) => f.id));
  const parentId = shownFolder(folder.parent_id, folderIds);
  const inside = subFolderIds(folders, folder.id);
  const notesInside = notes.filter((n) => {
    const shown = shownFolder(n.folder_id, folderIds);
    return shown === folder.id || (shown !== null && inside.has(shown));
  }).length;

  const archive = async () => {
    await archiveFolder(folder.id);
    navigate(listUrl(parentId), { replace: true });
  };

  return (
    <div className="details">
      <h3>Name</h3>
      <NameForm key={folder.name} label="Rename" initial={folder.name} onSave={(name) => updateFolder(folder.id, { name })} />

      <h3>Move to</h3>
      <select value={parentId ?? ""} onChange={(e) => updateFolder(folder.id, { parent_id: e.target.value || null })}>
        <FolderOptions folders={moveTargets(folders, folder.id)} />
      </select>

      <h3>Archive</h3>
      {confirming ? (
        <div className="confirm">
          <p>
            Archive “{folder.name}” with {inside.size} sub-folders and {notesInside} notes? Restore it from the Archive
            page.
          </p>
          <div className="buttons">
            <button className="danger" onClick={archive}>
              Archive
            </button>
            <button onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)}>Archive folder…</button>
      )}
    </div>
  );
}

// ---- Editor ----

const EMPTY: Content = { title: "", body: "" };
const contentOf = (note: Note): Content => ({ title: note.title, body: note.body });

function EditorView({ id }: { id: string }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const data = useNotesAndFolders();
  const folders = data?.folders ?? null;
  const recordings = useRecordings() ?? NO_RECORDINGS;
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [content, setContent] = useState<Content>(EMPTY);
  const [note, setNote] = useState<Note | null>(null); // the stored row, live; null = none (yet)

  // Refs: read by the save on leaving, after the last render
  const contentRef = useRef<Content>(EMPTY);
  const opened = useRef<Content | null>(null); // title and body when opened; null = new note
  const saved = useRef<Content | null>(null); // title and body stored on the device; null = no row
  const last = useRef<Note | null>(null); // the row as last seen, to recreate it if it vanishes
  const archived = useRef(false);
  const queue = useRef(Promise.resolve()); // writes one after another
  const writing = useRef(0); // writes not finished yet
  const hasRecordings = useRef(false); // a note with recordings isn't empty without text

  const run = (action: SaveAction) => {
    if (archived.current || action.kind === "none" || !last.current) return;
    const base = last.current;
    if (action.kind === "write") {
      saved.current = action.content;
      writing.current++;
      queue.current = queue.current
        .then(() => saveContent(action.content, base))
        .catch(console.error)
        .finally(() => writing.current--);
    } else {
      archived.current = true;
      queue.current = queue.current.then(() => archiveNote(id)).catch(console.error);
    }
  };

  // Load the note and follow changes from the other device
  useEffect(() => {
    let sub: { unsubscribe(): void } | undefined;
    let closed = false;
    let loaded = false;
    getDb().then((db) => {
      if (closed) return;
      sub = db.notes.findOne(id).$.subscribe((doc) => {
        const row = doc ? (doc.toJSON() as Note) : null;
        setNote(row);
        if (!loaded) {
          loaded = true;
          if (row) {
            opened.current = saved.current = contentRef.current = contentOf(row);
            last.current = row;
            setContent(contentOf(row));
          } else if (params.get("new") === "1") {
            last.current = newNote(id, params.get("folder"));
          } else {
            setState("missing");
            return;
          }
          setState("ready");
          return;
        }
        // Gone (archived): keep what's on screen; typing again brings the note back
        if (!row) return;
        last.current = row;
        // Our own writes echo back here; while one is unfinished, the box stays as typed
        if (writing.current > 0) return;
        // Show the other device's text only if nothing typed here is waiting to be saved
        if (sameContent(contentRef.current, saved.current)) {
          contentRef.current = contentOf(row);
          setContent(contentRef.current);
        }
        saved.current = contentOf(row);
      });
    });
    return () => {
      closed = true;
      sub?.unsubscribe();
    };
  }, [id]);

  const save = (leaving: boolean) =>
    run(toSave(contentRef.current, saved.current, opened.current, leaving, hasRecordings.current));

  // Save a moment after typing stops
  useEffect(() => {
    if (state !== "ready") return;
    const timer = setTimeout(() => save(false), 800);
    return () => clearTimeout(timer);
  }, [content, state]);

  // Save when leaving the editor, and when the app goes to the background (Android may close it)
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") save(false);
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      save(true);
    };
  }, []);

  const edit = (change: Partial<Content>) => {
    contentRef.current = { ...contentRef.current, ...change };
    setContent(contentRef.current);
  };

  const folderId = folders ? shownFolder((note ?? last.current)?.folder_id, new Set(folders.map((f) => f.id))) : null;
  const back = () => navigate(listUrl(folderId));
  const byNote = data ? recordingsByNote(recordings, data.notes) : new Map<string, Recording[]>();
  const mine = byNote.get(id) ?? NO_RECORDINGS;
  hasRecordings.current = mine.length > 0;

  if (state === "missing") {
    return (
      <Layout title="Notes">
        <p className="muted">This note isn't on this device. It may have been archived — see the Archive page.</p>
        <Link to="/tools/notes">Back to notes</Link>
      </Layout>
    );
  }

  const archive = () => {
    archived.current = true;
    queue.current = queue.current.then(() => archiveNote(id)).catch(console.error);
    navigate(listUrl(folderId), { replace: true });
  };

  return (
    <Layout
      title="Notes"
      tools={
        <>
          <NotesSettings />
          {data && (
            <NotesTree folders={data.folders} notes={data.notes} byNote={byNote} currentFolderId={folderId} currentNoteId={id} />
          )}
          <NoteDetails note={note} folders={folders ?? []} isNew={params.get("new") === "1"} onArchive={archive} />
        </>
      }
    >
      <div className="editor">
        <div className="editor-top">
          <button className="back" onClick={back}>
            <ArrowLeft size={16} /> Notes
          </button>
          {/* Into this note; a new note with no text yet is created at Stop, in its folder */}
          {RECORDS_HERE && state === "ready" && (
            <RecordButton target={() => ({ noteId: id, folderId: (note ?? last.current)?.folder_id ?? null })} />
          )}
        </div>
        <RecordingList recordings={mine} />
        <input
          className="note-title-box"
          value={content.title}
          disabled={state !== "ready"}
          // Empty title: the first line shows in its place, and is the title the list uses
          placeholder={
            content.body.trim() ? title(content.body) : mine.length > 0 ? noteTitle({ title: "", body: "" }, mine[0].recorded_at) : "Title"
          }
          onChange={(e) => edit({ title: e.target.value })}
        />
        <textarea
          value={content.body}
          disabled={state !== "ready"}
          autoFocus={params.get("new") === "1"}
          placeholder="Write here"
          onChange={(e) => edit({ body: e.target.value })}
        />
      </div>
    </Layout>
  );
}

type DetailsProps = { note: Note | null; folders: Folder[]; isNew: boolean; onArchive: () => void };

function NoteDetails({ note, folders, isNew, onArchive }: DetailsProps) {
  const [typed, setTyped] = useState("");

  if (!note) {
    return (
      <div className="details">
        <p className="muted">
          {isNew
            ? "Tags, pin and folder are here once the note has text."
            : "This note was archived on another device. Typing brings it back."}
        </p>
      </div>
    );
  }

  const add = (e?: FormEvent) => {
    e?.preventDefault();
    const tags = addTags(note.tags, typed);
    setTyped("");
    if (tags.length !== note.tags.length) updateNote(note.id, { tags });
  };
  const folderIds = new Set(folders.map((f) => f.id));

  return (
    <div className="details">
      <h3>Tags</h3>
      <div className="tags">
        {note.tags.map((tag) => (
          <span key={tag} className="tag on">
            {tag}
            <button
              className="icon"
              onClick={() => updateNote(note.id, { tags: note.tags.filter((t) => t !== tag) })}
              aria-label={`Remove ${tag}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      {/* Folder tags: where the note sits now; they change by moving the note, not here */}
      {folderTags(note.folder_id, folders).length > 0 && (
        <div className="tags">
          {folderTags(note.folder_id, folders).map((name, i) => (
            <span key={`${i}:${name}`} className="tag folder-tag" title="Folder tag: from where the note is">
              <FolderIcon size={12} /> {name}
            </span>
          ))}
        </div>
      )}
      <form className="name-form" onSubmit={add}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Add tags, comma between" />
        <button disabled={!typed.trim()}>Add</button>
      </form>

      <h3>Pin</h3>
      <button onClick={() => updateNote(note.id, { pinned: !note.pinned })}>
        {note.pinned ? (
          <>
            <PinOff size={16} /> Unpin
          </>
        ) : (
          <>
            <Pin size={16} /> Pin to the top
          </>
        )}
      </button>

      <h3>Folder</h3>
      <select
        value={shownFolder(note.folder_id, folderIds) ?? ""}
        onChange={(e) => updateNote(note.id, { folder_id: e.target.value || null })}
      >
        <FolderOptions folders={folders} />
      </select>

      <h3>Archive</h3>
      <button onClick={onArchive}>Archive note</button>
    </div>
  );
}
