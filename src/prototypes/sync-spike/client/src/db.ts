import { createRxDatabase, type RxCollection, type RxJsonSchema } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { replicateRxCollection } from "rxdb/plugins/replication";

export type Item = {
  id: string;
  text: string;
  created_at: string;
  updated_at: string; // set by the device; latest write wins
  archived_at: string | null;
};

// Server-assigned sequence number, so a late push of an old edit is still pulled
type Checkpoint = { seq: number };

const SERVER = import.meta.env.VITE_SERVER_URL as string;
const TOKEN = import.meta.env.VITE_TOKEN as string;
const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const schema: RxJsonSchema<Item> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 36 },
    text: { type: "string" },
    created_at: { type: "string" },
    updated_at: { type: "string" },
    archived_at: { type: ["string", "null"] },
  },
  required: ["id", "text", "created_at", "updated_at", "archived_at"],
};

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${SERVER}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export async function openDb() {
  const db = await createRxDatabase<{ items: RxCollection<Item> }>({
    name: "syncspike",
    storage: getRxStorageDexie(),
  });
  await db.addCollections({ items: { schema } });

  const replication = replicateRxCollection<Item, Checkpoint>({
    replicationIdentifier: `items-${SERVER}`,
    collection: db.items,
    pull: {
      handler: async (checkpoint, batchSize) =>
        call(`/items/pull?seq=${checkpoint?.seq ?? 0}&limit=${batchSize}`),
    },
    push: {
      // The server returns the rows it kept instead (conflicts); RxDB then takes those
      handler: async (rows) =>
        call("/items/push", { method: "POST", body: JSON.stringify(rows.map((r) => r.newDocumentState)) }),
    },
  });

  // No live stream from the server in the spike: poll, and pull as soon as the network returns
  setInterval(() => replication.reSync(), 5000);
  window.addEventListener("online", () => replication.reSync());

  return { items: db.items, replication };
}
