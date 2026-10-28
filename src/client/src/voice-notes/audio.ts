// Audio in the webview: reading a file's duration, fetching from the server, and the player.

import { useSyncExternalStore } from "react";
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

// ---- Player: one recording at a time. While the app is open, each recording keeps its
// position (Pause, then Play continues) and the chosen speed applies to all of them.

export const SPEEDS = [1, 1.5, 2];

type PlayerState = { id: string | null; playing: boolean; speed: number };
let state: PlayerState = { id: null, playing: false, speed: 1 };
let current: { id: string; audio: HTMLAudioElement; url: string } | null = null;
const positions = new Map<string, number>(); // seconds
const listeners = new Set<() => void>();

// A new object each time, so React redraws (also on every position change)
function update(next: Partial<PlayerState> = {}): void {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function usePlayer(): PlayerState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** Where a recording is, in seconds: live for the loaded one, else where it was left. */
export function positionOf(id: string): number {
  return current?.id === id ? current.audio.currentTime : (positions.get(id) ?? 0);
}

/**
 * MediaRecorder's WebM has no duration or seek index, so the webview can't jump around in it
 * until it has read to the end once: asking for a time past the end makes it do that.
 */
function makeSeekable(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timeout);
      audio.ondurationchange = null;
      audio.currentTime = 0;
      resolve();
    };
    const timeout = setTimeout(done, 10_000);
    audio.onerror = done;
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) return done();
      audio.ondurationchange = () => {
        if (Number.isFinite(audio.duration)) done();
      };
      audio.currentTime = 1e101;
    };
    audio.preload = "auto";
  });
}

/** Plays a recording from where it was left; load() gives its audio when it isn't loaded yet. */
export async function play(id: string, load: () => Promise<Blob>): Promise<void> {
  if (current?.id !== id) {
    stopPlaying();
    const url = URL.createObjectURL(await load());
    const audio = new Audio(url);
    await makeSeekable(audio);
    audio.currentTime = positions.get(id) ?? 0;
    audio.ontimeupdate = () => update();
    audio.onended = () => {
      positions.set(id, 0);
      audio.currentTime = 0;
      update({ playing: false });
    };
    current = { id, audio, url };
  }
  current!.audio.playbackRate = state.speed;
  update({ id, playing: true });
  try {
    await current!.audio.play();
  } catch (e) {
    stopPlaying();
    throw e;
  }
}

export function pause(): void {
  if (!current) return;
  current.audio.pause();
  positions.set(current.id, current.audio.currentTime);
  update({ playing: false });
}

export function seek(id: string, seconds: number): void {
  positions.set(id, seconds);
  if (current?.id === id) current.audio.currentTime = seconds;
  update();
}

export function setSpeed(speed: number): void {
  if (current) current.audio.playbackRate = speed;
  update({ speed });
}

/** Unloads the recording; its position is kept for the next Play. */
export function stopPlaying(): void {
  if (current) {
    const { id, audio, url } = current;
    current = null;
    audio.pause();
    positions.set(id, audio.currentTime);
    URL.revokeObjectURL(url);
  }
  update({ id: null, playing: false });
}
