// Recordings inside notes (notes-recordings_spec.md): the Record / Stop button (Android only)
// and a note's recordings with the player, upload state and Archive. Recording and audio rules
// are in notes/recordings/ (see voice-notes_spec.md for how they work).

import { Archive, Mic, Pause, Play, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { loadSettings } from "../api/settings";
import { fetchAudio, pause, play, positionOf, seek, setSpeed, SPEEDS, stopPlaying, usePlayer } from "../notes/recordings/audio";
import { readAudio } from "../notes/recordings/files";
import {
  durationLabel,
  MIME,
  playSource,
  sizeLabel,
  stateLabel,
  uploadState,
  type PlaySource,
} from "../notes/recordings/logic";
import { startRecording, stopRecording, useRecorder } from "../notes/recordings/recorder";
import { archiveRecording, type Target } from "../notes/recordings/rows";
import { RECORDS_HERE, useUploads } from "../notes/recordings/uploads";
import { getDb, type Recording } from "../sync/db";
import { useStatus } from "../sync/status";

export { RECORDS_HERE };

/**
 * Record / Stop with a running timer. `target()` names the note at the moment Record is pressed.
 * A recording keeps going on other screens; any Record button then shows its Stop.
 */
export function RecordButton({ target }: { target: () => Target }) {
  const { phase, startedAt, error } = useRecorder();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [phase]);

  return (
    <>
      {phase === "recording" ? (
        <button className="vn-stop" onClick={() => stopRecording()}>
          <Square size={16} /> Stop {durationLabel(Math.max(0, now - startedAt))}
        </button>
      ) : (
        <button className="vn-start" disabled={phase !== "idle"} onClick={() => startRecording(target())}>
          <Mic size={16} /> {phase === "asking" ? "Starting…" : phase === "saving" ? "Saving…" : "Record"}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </>
  );
}

/** A note's recordings, oldest first (already sorted by the caller). */
export function RecordingList({ recordings }: { recordings: Recording[] }) {
  const player = usePlayer();
  const uploads = useUploads();
  const { online } = useStatus();
  const [error, setError] = useState("");

  useEffect(() => () => stopPlaying(), []); // leaving the note stops the player

  if (recordings.length === 0) return null;

  async function onPlay(rec: Recording, source: PlaySource) {
    if (player.id === rec.id && player.playing) return pause();
    setError("");
    try {
      await play(rec.id, async () =>
        source.from === "local"
          ? new Blob([await readAudio(uploads.files.get(rec.id)!.name)], { type: MIME })
          : await fetchAudio(loadSettings()!, rec.id),
      );
    } catch (e) {
      setError(`Play failed: ${e}`);
    }
  }

  return (
    <>
      {error && <p className="error">{error}</p>}
      <ul className="vn-list">
        {recordings.map((rec) => {
          const file = uploads.files.get(rec.id); // either name: <id>.webm or <id>.uploaded.webm
          const hasFile = file !== undefined;
          const state = uploadState({
            uploaded: Boolean(rec.uploaded_at) || Boolean(file?.uploaded),
            recordsHere: RECORDS_HERE,
            hasFile,
            uploading: uploads.uploading === rec.id,
            error: uploads.errors[rec.id],
          });
          const source = playSource(state, hasFile, online);
          return (
            <Item
              key={rec.id}
              rec={rec}
              state={stateLabel(state)}
              stateKind={state.kind}
              source={source}
              loaded={player.id === rec.id}
              playing={player.id === rec.id && player.playing}
              speed={player.speed}
              onPlay={() => onPlay(rec, source)}
              onError={setError}
            />
          );
        })}
      </ul>
    </>
  );
}

type ItemProps = {
  rec: Recording;
  state: string;
  stateKind: string;
  source: PlaySource;
  loaded: boolean; // the player holds this recording (playing or paused)
  playing: boolean;
  speed: number;
  onPlay: () => void;
  onError: (message: string) => void;
};

function Item({ rec, state, stateKind, source, loaded, playing, speed, onPlay, onError }: ItemProps) {
  const position = positionOf(rec.id);
  const length = Math.max(rec.duration_ms / 1000, position);

  async function onArchive() {
    if (loaded) stopPlaying();
    try {
      await archiveRecording(await getDb(), rec.id);
    } catch (e) {
      onError(`Archive failed: ${e}`);
    }
  }

  return (
    <li className="vn-item">
      <div className="vn-meta muted">
        <span>{new Date(rec.recorded_at).toLocaleString()}</span>
        <span>{durationLabel(rec.duration_ms)}</span>
        <span>{sizeLabel(rec.size_bytes)}</span>
        <span className={`vn-state vn-${stateKind}`}>{state}</span>
      </div>
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
          onChange={(e) => seek(rec.id, Number(e.target.value))}
          aria-label="Position"
        />
        <span className="muted vn-time">
          {durationLabel(position * 1000)} / {durationLabel(length * 1000)}
        </span>
        <button onClick={onArchive} aria-label="Archive recording" title="Archive recording">
          <Archive size={16} />
        </button>
      </div>
      {(loaded || source.from === "none") && (
        <div className="vn-actions">
          {loaded &&
            SPEEDS.map((s) => (
              <button key={s} className={`tag ${speed === s ? "on" : ""}`} onClick={() => setSpeed(s)}>
                ×{s}
              </button>
            ))}
          {source.from === "none" && <span className="muted">{source.reason}</span>}
        </div>
      )}
    </li>
  );
}
