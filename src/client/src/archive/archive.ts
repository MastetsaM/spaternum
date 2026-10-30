// The shared Archive page's data: online only, straight from the server (archive_spec.md).
// Display rules live here as small functions so they can be tested without the UI.

import { ApiError, call } from "../api/client";
import type { components } from "../api/schema";
import type { Settings } from "../api/settings";

export type ArchivedItem = components["schemas"]["ArchivedItem"];

/** The filter buttons, in order. "" = everything. */
export const FILTERS = [
  { type: "", label: "All" },
  { type: "note", label: "Notes" },
  { type: "folder", label: "Folders" },
  { type: "voice_note", label: "Voice notes" },
] as const;

const TYPE_LABELS: Record<string, string> = {
  note: "Note",
  folder: "Folder",
  voice_note: "Voice note",
  event: "Event",
  series: "Repeating event",
};

/** "note" → "Note"; a type this app doesn't know yet is shown as it is. */
export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

/** ISO time → "2026-10-28 14:05" in the device's local time. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The title, or for an untitled voice note the time it was recorded. */
export function itemTitle(item: ArchivedItem): string {
  if (item.title.trim()) return item.title;
  if (item.recorded_at) return formatDateTime(item.recorded_at);
  return "(untitled)";
}

/** "Folder · 3 items" / "Repeating event · 2 changed occurrences" / "Note" */
export function itemKind(item: ArchivedItem): string {
  const count = (one: string, many: string) => `${item.items} ${item.items === 1 ? one : many}`;
  if (item.type === "folder") return `${typeLabel(item.type)} · ${count("item", "items")}`;
  if (item.type === "series" && item.items > 0) {
    return `${typeLabel(item.type)} · ${count("changed occurrence", "changed occurrences")}`;
  }
  return typeLabel(item.type);
}

/** What to show when a call fails. 401 is handled by the app (it opens the settings). */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 0) return "The archive needs the server — it isn't reachable.";
  if (e instanceof ApiError) return `Server error ${e.status}`;
  return String(e);
}

export function listArchived(settings: Settings, type: string): Promise<ArchivedItem[]> {
  return call(settings, type ? `/api/archive?type=${encodeURIComponent(type)}` : "/api/archive");
}

/** True if restored now; false if it was no longer archived (restored elsewhere → 404). */
export async function restore(settings: Settings, item: ArchivedItem): Promise<boolean> {
  try {
    await call(settings, `/api/archive/${item.module}/${item.id}/restore`, { method: "POST" });
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return false;
    throw e;
  }
}
