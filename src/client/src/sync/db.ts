// The local database (RxDB) and its sync with the server: one collection per synced table,
// pulled by the server's seq, pushed with latest-write-wins, nudged by the live stream.

import { createRxDatabase, type RxCollection, type RxDatabase, type RxJsonSchema } from "rxdb";
import { replicateRxCollection } from "rxdb/plugins/replication";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { Subject } from "rxjs";
import { call } from "../api/client";
import type { components } from "../api/schema";
import type { Settings } from "../api/settings";
import { listen } from "./events";

type Schemas = components["schemas"];
// RxDB manages _deleted itself (it's our "archived" flag), so it's not part of the schema
export type Folder = Omit<Schemas["Folder"], "_deleted">;
export type Note = Omit<Schemas["Note"], "_deleted">;
export type VoiceNote = Omit<Schemas["VoiceNote"], "_deleted">;

type Collections = {
  note_folders: RxCollection<Folder>;
  notes: RxCollection<Note>;
  voice_notes: RxCollection<VoiceNote>;
};
export type Db = RxDatabase<Collections>;

const id = { type: "string", maxLength: 36 } as const;
const text = { type: "string" } as const;
const nullableText = { type: ["string", "null"] } as const;
const tags = { type: "array", items: { type: "string" } } as const;
const synced = { id, created_at: text, updated_at: text };

const folderSchema: RxJsonSchema<Folder> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: { ...synced, parent_id: nullableText, name: text },
  required: ["id", "name", "created_at", "updated_at"],
};

const noteSchema: RxJsonSchema<Note> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: { ...synced, folder_id: nullableText, body: text, tags, pinned: { type: "boolean" } },
  required: ["id", "body", "tags", "pinned", "created_at", "updated_at"],
};

const voiceNoteSchema: RxJsonSchema<VoiceNote> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    ...synced,
    title: text,
    tags,
    recorded_at: text,
    duration_ms: { type: "number" },
    size_bytes: { type: "number" },
    mime_type: text,
    uploaded_at: nullableText, // set by the server only
  },
  required: ["id", "title", "tags", "recorded_at", "duration_ms", "size_bytes", "mime_type", "created_at", "updated_at"],
};

// Collection name = server table name; path = where its pull/push endpoints live
const TABLES = {
  note_folders: { schema: folderSchema, path: "/api/notes/note_folders" },
  notes: { schema: noteSchema, path: "/api/notes/notes" },
  voice_notes: { schema: voiceNoteSchema, path: "/api/voice-notes/voice_notes" },
} as const;
type Table = keyof typeof TABLES;

type Checkpoint = { seq: number };

// React's StrictMode runs effects twice in development: open the database only once
let opened: Promise<Db> | null = null;

export function startSync(settings: Settings): Promise<Db> {
  opened ??= open(settings);
  return opened;
}

export function getDb(): Promise<Db> {
  if (!opened) throw new Error("startSync() first");
  return opened;
}

async function open(settings: Settings): Promise<Db> {
  const db = await createRxDatabase<Collections>({ name: "spaternum", storage: getRxStorageDexie() });
  await db.addCollections({
    note_folders: { schema: folderSchema },
    notes: { schema: noteSchema },
    voice_notes: { schema: voiceNoteSchema },
  });

  const resync: Record<string, Subject<"RESYNC">> = {};
  for (const [table, { path }] of Object.entries(TABLES)) {
    const pulls = new Subject<"RESYNC">();
    resync[table] = pulls;
    replicateRxCollection<any, Checkpoint>({
      replicationIdentifier: `${table}-${settings.server}`,
      collection: db[table as Table],
      live: true,
      retryTime: 5000,
      pull: {
        handler: (checkpoint, batchSize) =>
          call(settings, `${path}/pull?seq=${checkpoint?.seq ?? 0}&limit=${batchSize}`),
        stream$: pulls.asObservable(),
      },
      push: {
        // The server answers with its own rows for the documents it didn't take
        handler: (rows) =>
          call(settings, `${path}/push`, {
            method: "POST",
            body: JSON.stringify(rows.map((row) => row.newDocumentState)),
          }),
      },
    });
  }

  listen(settings, {
    onTable: (table) => resync[table]?.next("RESYNC"),
    onConnect: () => Object.values(resync).forEach((pulls) => pulls.next("RESYNC")),
  });
  return db;
}
