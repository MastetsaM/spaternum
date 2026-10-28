// Settings synced across devices (favorites_spec.md): one row per key in the `settings`
// collection, the value as JSON text. Each key has a fixed id, so every device writes the same row.

import { useEffect, useState } from "react";
import { serverNow } from "./clock";
import { getDb } from "./db";

const IDS = {
  favorite_tools: "adc4dd49-6295-4f2b-a771-2f2bec2d700c",
} as const;
export type SettingKey = keyof typeof IDS;

// Last value seen per key, so a screen that opens shows it at once (every screen has its own Layout)
const latest: Partial<Record<SettingKey, string | null>> = {};

/** The setting's JSON text, kept up to date; null when never saved (or while loading). */
export function useSetting(key: SettingKey): string | null {
  const [value, setValue] = useState<string | null>(() => latest[key] ?? null);
  useEffect(() => {
    let sub: { unsubscribe(): void } | undefined;
    let closed = false;
    // No database before the first start's settings are saved: the default applies
    getDb()
      .then((db) => {
        if (closed) return;
        sub = db.settings.findOne(IDS[key]).$.subscribe((doc) => {
          latest[key] = doc?.value ?? null;
          setValue(latest[key]);
        });
      })
      .catch(() => {});
    return () => {
      closed = true;
      sub?.unsubscribe();
    };
  }, [key]);
  return value;
}

export async function saveSetting(key: SettingKey, value: string): Promise<void> {
  const db = await getDb();
  const now = serverNow();
  const doc = await db.settings.findOne(IDS[key]).exec();
  if (doc) await doc.incrementalPatch({ value, updated_at: now });
  else await db.settings.insert({ id: IDS[key], key, value, created_at: now, updated_at: now });
}
