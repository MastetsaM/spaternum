import { useEffect, useState } from "react";
import type { RxCollection } from "rxdb";
import { openDb, type Item } from "./db";
import "./App.css";

const now = () => new Date().toISOString();

function App() {
  const [items, setItems] = useState<RxCollection<Item> | null>(null);
  const [list, setList] = useState<Item[]>([]);
  const [draft, setDraft] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    let alive = true;
    const subs: { unsubscribe(): void }[] = [];
    openDb()
      .then(({ items, replication }) => {
        if (!alive) return;
        setItems(items);
        subs.push(
          items
            .find({ selector: { archived_at: null }, sort: [{ created_at: "asc" }] })
            .$.subscribe((docs) => setList(docs.map((d) => d.toJSON() as Item))),
          replication.error$.subscribe((e) => setSyncError(String(e))),
          replication.active$.subscribe((active) => active || setSyncError("")),
        );
      })
      .catch((e) => setSyncError(`Open failed: ${e}`));
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      alive = false;
      subs.forEach((s) => s.unsubscribe());
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function add() {
    if (!items || !draft.trim()) return;
    const t = now();
    await items.insert({ id: crypto.randomUUID(), text: draft, created_at: t, updated_at: t, archived_at: null });
    setDraft("");
  }

  async function edit(item: Item, text: string) {
    if (!items || text === item.text) return;
    await items.findOne(item.id).patch({ text, updated_at: now() });
  }

  async function archive(item: Item) {
    if (!items) return;
    const t = now();
    await items.findOne(item.id).patch({ archived_at: t, updated_at: t });
  }

  return (
    <main className="container">
      <h1>Sync spike</h1>
      <p>
        {online ? "Online" : "Offline"} · {list.length} items
      </p>
      {syncError && <p style={{ color: "crimson" }}>Sync: {syncError}</p>}

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.currentTarget.value)} placeholder="New item" />
        <button type="submit">Add</button>
      </form>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {list.map((item) => (
          <li key={item.id} style={{ margin: "0.5em 0" }}>
            {/* key includes updated_at so a synced change replaces the field's content */}
            <input
              key={item.updated_at}
              defaultValue={item.text}
              onBlur={(e) => edit(item, e.currentTarget.value)}
            />{" "}
            <button onClick={() => archive(item)}>Archive</button>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default App;
