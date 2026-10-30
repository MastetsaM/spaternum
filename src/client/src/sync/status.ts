// Online indicator from the last sync result — navigator.onLine stays true in airplane mode
// on Android. Also flags a token the server rejected, so the app can open the settings, and
// the modules whose sync the server refuses while it's online (the sync warning).

import { useSyncExternalStore } from "react";

/** failing: "<table> pull" / "<table> push" → the server's status code, for the last try that failed. */
export type Status = { online: boolean; tokenRejected: boolean; failing: Record<string, number> };

let status: Status = { online: false, tokenRejected: false, failing: {} };
const listeners = new Set<() => void>();

function set(next: Partial<Status>) {
  const merged = { ...status, ...next };
  if (
    merged.online === status.online &&
    merged.tokenRejected === status.tokenRejected &&
    merged.failing === status.failing
  ) {
    return;
  }
  status = merged;
  listeners.forEach((listener) => listener());
}

/** A pull or push the server answered with an error (not offline, not a rejected token). */
export function markSyncFailed(key: string, code: number) {
  if (status.failing[key] !== code) set({ failing: { ...status.failing, [key]: code } });
}

export function markSynced(key: string) {
  if (!(key in status.failing)) return;
  const { [key]: _done, ...rest } = status.failing;
  set({ failing: rest });
}

const MODULES: Record<string, string> = {
  note_folders: "Notes",
  notes: "Notes",
  voice_notes: "Voice notes",
  calendar_events: "Calendar",
};

/** One line per module: "Calendar isn't syncing (server: 404)". */
export function syncWarnings(failing: Record<string, number>): string[] {
  const codes = new Map<string, Set<number>>();
  for (const [key, code] of Object.entries(failing)) {
    const table = key.split(" ")[0];
    const name = MODULES[table] ?? table;
    codes.set(name, (codes.get(name) ?? new Set()).add(code));
  }
  return [...codes].map(([name, set]) => `${name} isn't syncing (server: ${[...set].sort().join(", ")})`);
}

export const markOnline = () => set({ online: true, tokenRejected: false });
export const markOffline = () => set({ online: false });
export const markTokenRejected = () => set({ online: false, tokenRejected: true });

export const currentStatus = () => status;

/** For code outside React (the voice-notes upload queue): called on every change. */
export function onStatusChange(listener: (status: Status) => void): () => void {
  const notify = () => listener(status);
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useStatus(): Status {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status,
  );
}
