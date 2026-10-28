// Voice notes: Record / Stop (Android only), the list newest first with upload state, Play,
// edit title and tags, Archive. The side panel / ☰ drawer holds the tag filter.

import { Archive, Mic, Pencil, Play, Square } from "lucide-react";
import { useEffect, useState } from "react";
import type { RxDocument } from "rxdb";
import { loadSettings } from "../api/settings";
import { Layout } from "../layout/Layout";
import { getDb, type VoiceNote } from "../sync/db";
import { useStatus } from "../sync/status";
import { fetchAudio, play, stopPlaying } from "../voice-notes/audio";
import { readAudio } from "../voice-notes/files";
import {
  allTags,
  doneName,
  durationLabel,
  MIME,
  parseTags,
  playSource,
  sizeLabel,
  stateLabel,
  titleOf,
  uploadState,
  visibleRows,
  type PlaySource,
} from "../voice-notes/logic";
import { startRecording, stopRecording, useRecorder } from "../voice-notes/recorder";
import { archive, saveEdits } from "../voice-notes/rows";
import { RECORDS_HERE, useUploads } from "../voice-notes/uploads";

type Doc = RxDocument<VoiceNote>;

export function VoiceNotesScreen() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tag, setTag] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const uploads = useUploads();
  const { online } = useStatus();

  useEffect(() => {
    let stop = () => {};
    getDb().then((db) => {
      const sub = db.voice_notes.find().$.subscribe(setDocs);
      stop = () => sub.unsubscribe();
    });
    return () => {
      stop();
      stopPlaying();
    };
  }, []);

  const tags = allTags(docs);
  const shownTag = tag !== null && tags.includes(tag) ? tag : null;

  async function onPlay(doc: Doc, source: PlaySource) {
    if (playing === doc.id) return stopPlaying();
    setError("");
    try {
      const audio =
        source.from === "local"
          ? new Blob([await readAudio(doneName(doc.id))], { type: MIME })
          : await fetchAudio(loadSettings()!, doc.id);
      setPlaying(doc.id);
      await play(audio, () => setPlaying((id) => (id === doc.id ? null : id)));
    } catch (e) {
      setError(`Play failed: ${e}`);
    }
  }

  const side = (
    <ul className="vn-tags">
      <li>
        <button className={shownTag === null ? "active" : ""} onClick={() => setTag(null)}>
          All
        </button>
      </li>
      {tags.map((t) => (
        <li key={t}>
          <button className={shownTag === t ? "active" : ""} onClick={() => setTag(t)}>
            #{t}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <Layout title="Voice notes" side={side}>
      {RECORDS_HERE && <RecordBar />}
      {error && <p className="error">{error}</p>}
      {docs.length === 0 && <p className="muted">No voice notes yet.</p>}
      <ul className="vn-list">
        {visibleRows(docs, shownTag).map((doc) => {
          const hasFile = uploads.files.has(doc.id);
          const state = uploadState({
            uploaded: Boolean(doc.uploaded_at) || uploads.uploaded.has(doc.id),
            recordsHere: RECORDS_HERE,
            hasFile,
            uploading: uploads.uploading === doc.id,
            error: uploads.errors[doc.id],
          });
          const source = playSource(state, hasFile, online);
          return (
            <Item
              key={doc.id}
              doc={doc}
              state={stateLabel(state)}
              stateKind={state.kind}
              source={source}
              playing={playing === doc.id}
              onPlay={() => onPlay(doc, source)}
              onError={setError}
            />
          );
        })}
      </ul>
    </Layout>
  );
}

function RecordBar() {
  const { phase, startedAt, error } = useRecorder();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [phase]);

  return (
    <div className="vn-record">
      {phase === "recording" ? (
        <button className="vn-stop" onClick={() => stopRecording()}>
          <Square size={18} /> Stop {durationLabel(Math.max(0, now - startedAt))}
        </button>
      ) : (
        <button className="vn-start" disabled={phase !== "idle"} onClick={() => startRecording()}>
          <Mic size={18} /> {phase === "asking" ? "Starting…" : phase === "saving" ? "Saving…" : "Record"}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

type ItemProps = {
  doc: Doc;
  state: string;
  stateKind: string;
  source: PlaySource;
  playing: boolean;
  onPlay: () => void;
  onError: (message: string) => void;
};

function Item({ doc, state, stateKind, source, playing, onPlay, onError }: ItemProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");

  function edit() {
    setTitle(doc.title);
    setTags(doc.tags.join(", "));
    setEditing(true);
  }

  async function save() {
    try {
      await saveEdits(doc, title, parseTags(tags));
      setEditing(false);
    } catch (e) {
      onError(`Save failed: ${e}`);
    }
  }

  async function onArchive() {
    if (playing) stopPlaying();
    await archive(doc).catch((e) => onError(`Archive failed: ${e}`));
  }

  return (
    <li className="vn-item">
      {editing ? (
        <div className="vn-edit">
          <input value={title} placeholder="Title (optional)" onChange={(e) => setTitle(e.target.value)} />
          <input value={tags} placeholder="Tags, comma-separated" onChange={(e) => setTags(e.target.value)} />
          <div className="vn-actions">
            <button onClick={save}>Save</button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="vn-title">{titleOf(doc)}</div>
          <div className="vn-meta muted">
            {doc.title.trim() && <span>{new Date(doc.recorded_at).toLocaleString()}</span>}
            <span>{durationLabel(doc.duration_ms)}</span>
            <span>{sizeLabel(doc.size_bytes)}</span>
            <span className={`vn-state vn-${stateKind}`}>{state}</span>
          </div>
          {doc.tags.length > 0 && (
            <div className="vn-chips">
              {doc.tags.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </div>
          )}
          <div className="vn-actions">
            <button
              onClick={onPlay}
              disabled={source.from === "none"}
              title={source.from === "none" ? source.reason : undefined}
            >
              {playing ? <Square size={16} /> : <Play size={16} />} {playing ? "Stop" : "Play"}
            </button>
            {source.from === "none" && <span className="muted">{source.reason}</span>}
            <button onClick={edit} aria-label="Edit title and tags">
              <Pencil size={16} /> Edit
            </button>
            <button onClick={onArchive} aria-label="Archive">
              <Archive size={16} /> Archive
            </button>
          </div>
        </>
      )}
    </li>
  );
}
