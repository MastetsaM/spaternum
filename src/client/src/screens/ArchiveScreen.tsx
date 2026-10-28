// The shared Archive page: everything archived, from every module, with a type filter and Restore.
// Online only — it calls the server each time; restored items come back to devices through sync.

import { useEffect, useState } from "react";
import { loadSettings } from "../api/settings";
import {
  errorMessage,
  FILTERS,
  formatDateTime,
  itemKind,
  itemTitle,
  listArchived,
  restore,
  type ArchivedItem,
} from "../archive/archive";
import { Layout } from "../layout/Layout";

export function ArchiveScreen() {
  const settings = loadSettings()!; // the app only opens this screen once settings are saved
  const [type, setType] = useState("");
  const [items, setItems] = useState<ArchivedItem[] | null>(null); // null = loading or failed
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // id being restored
  const [attempt, setAttempt] = useState(0); // Retry bumps it to load again

  useEffect(() => {
    let current = true; // ignore an answer that arrives after the filter changed
    setItems(null);
    setError("");
    listArchived(settings, type).then(
      (list) => current && setItems(list),
      (e) => current && setError(errorMessage(e)),
    );
    return () => {
      current = false;
    };
  }, [type, attempt]);

  async function onRestore(item: ArchivedItem) {
    setBusy(item.id);
    setNote("");
    setError("");
    try {
      const restored = await restore(settings, item);
      setItems((list) => list?.filter((i) => i.id !== item.id) ?? null);
      setNote(restored ? `Restored "${itemTitle(item)}".` : `"${itemTitle(item)}" was already restored.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Layout title="Archive">
      <div className="archive-filters">
        {FILTERS.map((f) => (
          <button key={f.type} className={f.type === type ? "on" : ""} onClick={() => setType(f.type)}>
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="error">
          {error} <button onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </p>
      )}
      {note && <p className="muted">{note}</p>}
      {items === null && !error && <p className="muted">Loading…</p>}
      {items?.length === 0 && <p className="muted">Nothing archived.</p>}

      {items && items.length > 0 && (
        <ul className="archive-list">
          {items.map((item) => (
            <li key={`${item.module}/${item.id}`}>
              <div>
                <div className="archive-title">{itemTitle(item)}</div>
                <div className="muted">
                  {itemKind(item)} · archived {formatDateTime(item.archived_at)}
                </div>
              </div>
              <button disabled={busy !== null} onClick={() => onRestore(item)}>
                {busy === item.id ? "Restoring…" : "Restore"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
