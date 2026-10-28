// The one place that touches audio files on the device ([[2026-10-20-local-files-behind-interface]]):
// the voice-notes/ folder in the app's data folder (Android app storage). The PC keeps no audio.

import { BaseDirectory, exists, mkdir, readDir, readFile, rename, size, writeFile } from "@tauri-apps/plugin-fs";

const DIR = "voice-notes";
const at = { baseDir: BaseDirectory.AppData };
const path = (name: string) => `${DIR}/${name}`;

/** Names of the files in the folder (none if it doesn't exist yet). */
export async function listFiles(): Promise<string[]> {
  if (!(await exists(DIR, at))) return [];
  return (await readDir(DIR, at)).filter((entry) => entry.isFile).map((entry) => entry.name);
}

/** Adds bytes to the end of the file, creating it (and the folder) if needed. */
export async function appendFile(name: string, bytes: Uint8Array): Promise<void> {
  await mkdir(DIR, { ...at, recursive: true });
  await writeFile(path(name), bytes, { ...at, append: true });
}

export const fileSize = (name: string): Promise<number> => size(path(name), at);

export const readAudio = (name: string): Promise<Uint8Array<ArrayBuffer>> => readFile(path(name), at);

export const renameFile = (from: string, to: string): Promise<void> =>
  rename(path(from), path(to), { oldPathBaseDir: at.baseDir, newPathBaseDir: at.baseDir });
