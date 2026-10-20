import { useEffect, useRef, useState } from "react";
import {
  BaseDirectory,
  exists,
  mkdir,
  readFile,
  readTextFile,
  remove,
  writeFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import "./App.css";

type Recording = {
  file: string;
  date: string;
  seconds: number;
  bytes: number;
  docsCopy: string; // "ok" or the error from writing to DOCS
};

const DIR = "recordings";
const INDEX = `${DIR}/index.json`;
// Shared storage test from the spec: does writing here work on Android 16?
const DOCS = "/storage/emulated/0/Documents/Spaternum";
const app = { baseDir: BaseDirectory.AppData };

// The spec's two candidates, in order of preference
const MIME = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"].find((m) =>
  MediaRecorder.isTypeSupported(m),
);

async function loadIndex(): Promise<Recording[]> {
  if (!(await exists(INDEX, app))) return [];
  return JSON.parse(await readTextFile(INDEX, app));
}

async function saveIndex(list: Recording[]) {
  await writeTextFile(INDEX, JSON.stringify(list), app);
}

function formatSeconds(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function App() {
  const [list, setList] = useState<Recording[]>([]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadIndex().then(setList).catch((e) => setError(`Load failed: ${e}`));
  }, []);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(timer);
  }, [recording]);

  async function start() {
    setError("");
    if (!MIME) return setError("No Opus format supported by this webview.");
    let stream: MediaStream;
    try {
      // The defaults are tuned for calls and can make recordings sound muffled
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      return setError(`Microphone not available: ${e}`);
    }
    const chunks: Blob[] = [];
    // 32 kbps is plenty for speech; the webview default was ~125 kbps
    const rec = new MediaRecorder(stream, { mimeType: MIME, audioBitsPerSecond: 32000 });
    const started = Date.now();
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const seconds = Math.round((Date.now() - started) / 1000);
      save(new Blob(chunks, { type: MIME }), seconds).catch((e) => setError(`Save failed: ${e}`));
    };
    rec.start();
    recorder.current = rec;
    setElapsed(0);
    setRecording(true);
  }

  function stop() {
    recorder.current?.stop();
    setRecording(false);
  }

  async function save(blob: Blob, seconds: number) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ext = MIME!.startsWith("audio/webm") ? "webm" : "ogg";
    const file = `${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;
    await mkdir(DIR, { ...app, recursive: true });
    await writeFile(`${DIR}/${file}`, bytes, app);

    let docsCopy = "ok";
    try {
      await mkdir(DOCS, { recursive: true });
      await writeFile(`${DOCS}/${file}`, bytes);
    } catch (e) {
      docsCopy = String(e);
    }

    const entry = { file, date: new Date().toISOString(), seconds, bytes: bytes.length, docsCopy };
    const next = [entry, ...(await loadIndex())];
    await saveIndex(next);
    setList(next);
  }

  async function play(r: Recording) {
    player.current?.pause();
    const bytes = await readFile(`${DIR}/${r.file}`, app);
    const url = URL.createObjectURL(new Blob([bytes], { type: MIME }));
    player.current = new Audio(url);
    player.current.onended = () => URL.revokeObjectURL(url);
    player.current.play().catch((e) => setError(`Play failed: ${e}`));
  }

  async function del(r: Recording) {
    await remove(`${DIR}/${r.file}`, app);
    await remove(`${DOCS}/${r.file}`).catch(() => {}); // the copy may not exist
    const next = list.filter((x) => x.file !== r.file);
    await saveIndex(next);
    setList(next);
  }

  return (
    <main className="container">
      <h1>Voice recorder</h1>
      <p>Format: {MIME ?? "none"}</p>

      {recording ? (
        <button onClick={stop}>Stop {formatSeconds(elapsed)}</button>
      ) : (
        <button onClick={start}>Record</button>
      )}

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <ul style={{ listStyle: "none", padding: 0, textAlign: "left" }}>
        {list.map((r) => (
          <li key={r.file} style={{ margin: "1em 0" }}>
            {new Date(r.date).toLocaleString()} · {formatSeconds(r.seconds)} ·{" "}
            {(r.bytes / 1024).toFixed(0)} KB
            <br />
            <small>Documents copy: {r.docsCopy}</small>
            <br />
            <button onClick={() => play(r).catch((e) => setError(`Play failed: ${e}`))}>
              Play
            </button>{" "}
            <button onClick={() => del(r).catch((e) => setError(`Delete failed: ${e}`))}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default App;
