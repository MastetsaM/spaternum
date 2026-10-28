// Voice notes: Record / Stop (Android only), the list newest first with upload state, a player
// (Play / Pause, position bar, speed),
// edit title and tags, Archive. The tool panel (right) holds the tag filter.

import { Archive, Mic, Pause, Pencil, Play, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { RxDocument } from "rxdb";
import { loadSettings } from "../api/settings";
import { Layout } from "../layout/Layout";
import { getDb, type VoiceNote } from "../sync/db";
import { useStatus } from "../sync/status";
import { fetchAudio, pause, play, positionOf, seek, setSpeed, SPEEDS, stopPlaying, usePlayer } from "../voice-notes/audio";
import { readAudio } from "../voice-notes/files";
import {
  allTags,
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
  // The tag filter lives in the URL (?tag=…), like the notes screen; the phone drawer closes on change
  const [params, setParams] = useSearchParams();
  const tag = params.get("tag");
  const setTag = (next: string | null) => setParams(next === null ? {} : { tag: next });
  const player = usePlayer();
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
    if (player.id === doc.id && player.playing) return pause();
    setError("");
    try {
      await play(doc.id, async () =>
        source.from === "local"
          ? new Blob([await readAudio(uploads.files.get(doc.id)!.name)], { type: MIME })
          : await fetchAudio(loadSettings()!, doc.id),
      );
    } catch (e) {
      setError(`Play failed: ${e}`);
    }
  }

  const tagFilter = (
    <>
      <h3 className="panel-label">Tags</h3>
      <div className="tags">
        <button className={`tag ${shownTag === null ? "on" : ""}`} onClick={() => setTag(null)}>
          All
        </button>
        {tags.map((t) => (
          <button key={t} className={`tag ${shownTag === t ? "on" : ""}`} onClick={() => setTag(t)}>
            {t}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <Layout title="Voice notes" tools={tagFilter}>
      {RECORDS_HERE && <RecordBar />}
      {error && <p className="error">{error}</p>}
      {docs.length === 0 && <p className="muted">No voice notes yet.</p>}
      <ul className="vn-list">
        {visibleRows(docs, shownTag).map((doc) => {
          const file = uploads.files.get(doc.id); // either name: <id>.webm or <id>.uploaded.webm
          const hasFile = file !== undefined;
          const state = uploadState({
            uploaded: Boolean(doc.uploaded_at) || Boolean(file?.uploaded),
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
              loaded={player.id === doc.id}
              playing={player.id === doc.id && player.playing}
              speed={player.speed}
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
  loaded: boolean; // the player holds this recording (playing or paused)
  playing: boolean;
  speed: number;
  onPlay: () => void;
  onError: (message: string) => void;
};

function Item({ doc, state, stateKind, source, loaded, playing, speed, onPlay, onError }: ItemProps) {
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

  const position = positionOf(doc.id);
  const length = Math.max(doc.duration_ms / 1000, position);

  async function onArchive() {
    if (loaded) stopPlaying();
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
            <div className="tags">
              {doc.tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="vn-player">
            <button onClick={onPlay} disabled={source.from === "none"} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <input
              type="range"
              min={0}
              max={length}
              step={0.1}
              value={position}
              disabled={source.from === "none"}
              onChange={(e) => seek(doc.id, Number(e.target.value))}
              aria-label="Position"
            />
            <span className="muted vn-time">
              {durationLabel(position * 1000)} / {durationLabel(length * 1000)}
            </span>
          </div>
          {loaded && (
            <div className="tags">
              {SPEEDS.map((s) => (
                <button key={s} className={`tag ${speed === s ? "on" : ""}`} onClick={() => setSpeed(s)}>
                  ×{s}
                </button>
              ))}
            </div>
          )}
          <div className="vn-actions">
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
