// Notes: folder tree in the side panel, note list or editor in the main area, folder or
// note details in the tool panel. Rules live in notes/notes.ts, database writes in notes/store.ts.

import { ArrowLeft, Folder as FolderIcon, Pin, PinOff, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Layout } from "../layout/Layout";
import {
  addTags,
  allTags,
  folderTree,
  moveTargets,
  searchNotes,
  shownFolder,
  sortNotes,
  subFolderIds,
  title,
  toSave,
  type SaveAction,
} from "../notes/notes";
import {
  archiveFolder,
  archiveNote,
  createFolder,
  newNote,
  saveBody,
  updateFolder,
  updateNote,
  useFolders,
  useNotes,
} from "../notes/store";
import { getDb, type Folder, type Note } from "../sync/db";

const listUrl = (folderId: string | null) => (folderId ? `/tools/notes?folder=${folderId}` : "/tools/notes");

/** /tools/notes → the list; /tools/notes/<id> → the editor. */
export function NotesScreen() {
  const { noteId } = useParams();
  return noteId ? <EditorView key={noteId} id={noteId} /> : <ListView />;
}

// ---- List ----

function ListView() {
  const notes = useNotes();
  const folders = useFolders();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const text = params.get("q") ?? "";
  const tags = params.getAll("tag");

  if (!notes || !folders) {
    return (
      <Layout title="Notes">
        <p className="muted">Loading…</p>
      </Layout>
    );
  }

  const folderIds = new Set(folders.map((f) => f.id));
  const current = folders.find((f) => f.id === params.get("folder")) ?? null;
  const searching = text.trim() !== "" || tags.length > 0;
  const shown = sortNotes(
    searching
      ? searchNotes(notes, text, tags)
      : notes.filter((n) => shownFolder(n.folder_id, folderIds) === (current?.id ?? null)),
  );

  // Search lives in the URL, so the back gesture from a note returns to the same results
  const setSearch = (nextText: string, nextTags: string[]) => {
    const next = new URLSearchParams();
    if (current) next.set("folder", current.id);
    if (nextText) next.set("q", nextText);
    nextTags.forEach((tag) => next.append("tag", tag));
    setParams(next, { replace: true });
  };
  const toggleTag = (tag: string) =>
    setSearch(text, tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);

  const openNew = () => {
    const folder = current ? `&folder=${current.id}` : "";
    navigate(`/tools/notes/${crypto.randomUUID()}?new=1${folder}`);
  };

  return (
    <Layout
      title={searching ? "Search" : (current?.name ?? "Notes")}
      side={<FolderTree folders={folders} currentId={current?.id ?? null} />}
      tools={<FolderDetails key={current?.id ?? "top"} folder={current} folders={folders} notes={notes} />}
    >
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
        </div>
      </div>

      <button className="new-note" onClick={openNew}>
        <Plus size={16} /> New note
      </button>

      {shown.length === 0 ? (
        <p className="muted">{searching ? "No notes match." : "No notes here yet."}</p>
      ) : (
        <ul className="note-list">
          {shown.map((note) => (
            <NoteRow key={note.id} note={note} folder={searching ? folders.find((f) => f.id === note.folder_id) : undefined} />
          ))}
        </ul>
      )}
    </Layout>
  );
}

function NoteRow({ note, folder }: { note: Note; folder?: Folder }) {
  return (
    <li>
      <Link to={`/tools/notes/${note.id}`}>
        <span className="note-title">
          {note.pinned && <Pin size={14} />} {title(note.body)}
        </span>
        <span className="muted note-meta">
          {new Date(note.updated_at).toLocaleString()}
          {folder && ` · ${folder.name}`}
          {note.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </span>
      </Link>
    </li>
  );
}

// ---- Folders ----

function FolderTree({ folders, currentId }: { folders: Folder[]; currentId: string | null }) {
  return (
    <ul className="folder-tree">
      <li>
        <Link to={listUrl(null)} className={currentId === null ? "active" : ""}>
          Top level
        </Link>
      </li>
      {folderTree(folders).map(({ folder, depth }) => (
        <li key={folder.id} style={{ paddingLeft: depth * 14 }}>
          <Link to={listUrl(folder.id)} className={folder.id === currentId ? "active" : ""}>
            <FolderIcon size={15} /> {folder.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

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

function FolderDetails({ folder, folders, notes }: { folder: Folder | null; folders: Folder[]; notes: Note[] }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  if (!folder) {
    return (
      <div className="details">
        <h2>Top level</h2>
        <h3>New folder</h3>
        <NameForm label="Create" onSave={(name) => createFolder(name, null)} />
      </div>
    );
  }

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

      <h3>New sub-folder</h3>
      <NameForm label="Create" onSave={(name) => createFolder(name, folder.id)} />

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

function EditorView({ id }: { id: string }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const folders = useFolders();
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [text, setText] = useState("");
  const [note, setNote] = useState<Note | null>(null); // the stored row, live; null = none (yet)

  // Refs: read by the save on leaving, after the last render
  const textRef = useRef("");
  const opened = useRef<string | null>(null); // body when opened; null = new note
  const saved = useRef<string | null>(null); // body stored on the device; null = no row
  const last = useRef<Note | null>(null); // the row as last seen, to recreate it if it vanishes
  const archived = useRef(false);
  const queue = useRef(Promise.resolve()); // writes one after another
  const writing = useRef(0); // writes not finished yet

  const run = (action: SaveAction) => {
    if (archived.current || action.kind === "none" || !last.current) return;
    const base = last.current;
    if (action.kind === "write") {
      saved.current = action.body;
      writing.current++;
      queue.current = queue.current
        .then(() => saveBody(action.body, base))
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
            opened.current = saved.current = textRef.current = row.body;
            last.current = row;
            setText(row.body);
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
        if (textRef.current === saved.current) {
          textRef.current = row.body;
          setText(row.body);
        }
        saved.current = row.body;
      });
    });
    return () => {
      closed = true;
      sub?.unsubscribe();
    };
  }, [id]);

  // Save a moment after typing stops
  useEffect(() => {
    if (state !== "ready") return;
    const timer = setTimeout(() => run(toSave(textRef.current, saved.current, opened.current, false)), 800);
    return () => clearTimeout(timer);
  }, [text, state]);

  // Save when leaving the editor, and when the app goes to the background (Android may close it)
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") run(toSave(textRef.current, saved.current, opened.current, false));
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      run(toSave(textRef.current, saved.current, opened.current, true));
    };
  }, []);

  const folderId = folders ? shownFolder((note ?? last.current)?.folder_id, new Set(folders.map((f) => f.id))) : null;
  const back = () => navigate(listUrl(folderId));

  if (state === "missing") {
    return (
      <Layout title="Note">
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
      title={text.trim() ? title(text) : params.get("new") === "1" ? "New note" : "Note"}
      side={folders && <FolderTree folders={folders} currentId={folderId} />}
      tools={<NoteDetails note={note} folders={folders ?? []} isNew={params.get("new") === "1"} onArchive={archive} />}
    >
      <div className="editor">
        <button className="back" onClick={back}>
          <ArrowLeft size={16} /> Notes
        </button>
        <textarea
          value={text}
          disabled={state !== "ready"}
          autoFocus={params.get("new") === "1"}
          placeholder="First line is the title"
          onChange={(e) => {
            textRef.current = e.target.value;
            setText(e.target.value);
          }}
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
