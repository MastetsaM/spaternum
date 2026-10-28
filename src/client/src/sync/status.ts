// Online indicator from the last sync result — navigator.onLine stays true in airplane mode
// on Android. Also flags a token the server rejected, so the app can open the settings.

import { useSyncExternalStore } from "react";

export type Status = { online: boolean; tokenRejected: boolean };

let status: Status = { online: false, tokenRejected: false };
const listeners = new Set<() => void>();

function set(next: Partial<Status>) {
  const merged = { ...status, ...next };
  if (merged.online === status.online && merged.tokenRejected === status.tokenRejected) return;
  status = merged;
  listeners.forEach((listener) => listener());
}

export const markOnline = () => set({ online: true, tokenRejected: false });
export const markOffline = () => set({ online: false });
export const markTokenRejected = () => set({ online: false, tokenRejected: true });

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
