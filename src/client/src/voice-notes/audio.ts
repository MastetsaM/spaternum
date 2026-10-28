// Audio in the webview: reading a file's duration, fetching from the server, playing one at a time.

import type { Settings } from "../api/settings";
import { MIME } from "./logic";

/**
 * Duration of a recording in ms (0 if it can't be read). MediaRecorder's WebM has no duration
 * in its header, so the browser reports Infinity until asked to seek past the end.
 */
export function durationOf(bytes: Uint8Array<ArrayBuffer>): Promise<number> {
  const url = URL.createObjectURL(new Blob([bytes], { type: MIME }));
  const audio = new Audio();
  return new Promise((resolve) => {
    const done = (seconds: number) => {
      clearTimeout(timeout);
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0);
    };
    const timeout = setTimeout(() => done(0), 10_000);
    audio.onerror = () => done(0);
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) return done(audio.duration);
      audio.ondurationchange = () => {
        if (Number.isFinite(audio.duration)) done(audio.duration);
      };
      audio.currentTime = 1e101;
    };
    audio.preload = "metadata";
    audio.src = url;
  });
}

/** The whole file from the server. <audio src> can't send the token, so it's fetched. */
export async function fetchAudio(settings: Settings, id: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${settings.server}/api/voice-notes/${id}/audio`, {
      headers: { Authorization: `Bearer ${settings.token}` },
    });
  } catch {
    throw new Error("server not reachable");
  }
  if (!response.ok) throw new Error(`server answered ${response.status}`);
  return response.blob();
}

let current: { audio: HTMLAudioElement; url: string; onEnd: () => void } | null = null;

/** Plays the audio, stopping whatever was playing; onEnd runs once, when it ends or is stopped. */
export async function play(audio: Blob, onEnd: () => void): Promise<void> {
  stopPlaying();
  const url = URL.createObjectURL(audio);
  const element = new Audio(url);
  current = { audio: element, url, onEnd };
  element.onended = stopPlaying;
  try {
    await element.play();
  } catch (e) {
    stopPlaying();
    throw e;
  }
}

export function stopPlaying(): void {
  if (!current) return;
  const { audio, url, onEnd } = current;
  current = null;
  audio.pause();
  URL.revokeObjectURL(url);
  onEnd();
}
