// Server address + API token. First thing shown until both are saved; later from the rail.

import { useEffect, useState } from "react";
import { ApiError, call } from "../api/client";
import { loadSettings, normalizeServer, saveSettings, type Settings } from "../api/settings";
import { Layout } from "../layout/Layout";
import { getDb } from "../sync/db";
import { useStatus } from "../sync/status";

type Check = { ok: boolean; message: string } | null;

async function testConnection(settings: Settings): Promise<Check> {
  try {
    const health = await fetch(`${settings.server}/health`);
    if (!health.ok) return { ok: false, message: `Server answered ${health.status}` };
  } catch {
    return { ok: false, message: "Server not reachable — check the address and Tailscale" };
  }
  try {
    await call(settings, "/api/archive?type=none"); // any /api route checks the token
    return { ok: true, message: "Connected" };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { ok: false, message: "Token rejected" };
    return { ok: false, message: `Server error: ${e}` };
  }
}

export function SettingsScreen() {
  const saved = loadSettings();
  const [server, setServer] = useState(saved?.server ?? "");
  const [token, setToken] = useState(saved?.token ?? "");
  const [check, setCheck] = useState<Check>(null);
  const { tokenRejected } = useStatus();

  const settings = { server: normalizeServer(server), token: token.trim() };
  const complete = settings.server !== "" && settings.token !== "";

  async function save() {
    saveSettings(settings);
    // Restart with the new settings: the database and sync open once, at start
    window.location.hash = "#/home";
    window.location.reload();
  }

  const form = (
    <form className="settings" onSubmit={(e) => e.preventDefault()}>
      {!saved && <p>Connect to your Spaternum server.</p>}
      {tokenRejected && <p className="error">The server rejected the token. Enter the current one.</p>}
      <label>
        Server address
        <input
          value={server}
          onChange={(e) => setServer(e.target.value)}
          placeholder="raspberrypi.your-tailnet.ts.net"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </label>
      <label>
        API token
        <input value={token} onChange={(e) => setToken(e.target.value)} type="password" autoComplete="off" />
      </label>
      <div className="buttons">
        <button type="button" disabled={!complete} onClick={async () => setCheck(await testConnection(settings))}>
          Test connection
        </button>
        <button type="button" disabled={!complete} onClick={save}>
          Save
        </button>
      </div>
      {check && <p className={check.ok ? "ok" : "error"}>{check.message}</p>}
      {saved && <LocalData />}
    </form>
  );

  // Before the first save there's nothing else to show: no rail, no panels
  return saved ? <Layout title="Settings">{form}</Layout> : <div className="first-start">{form}</div>;
}

/** How many items each local collection holds — shows that sync works. */
function LocalData() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let subscriptions: { unsubscribe(): void }[] = [];
    getDb().then((db) => {
      subscriptions = (["note_folders", "notes", "voice_notes"] as const).map((name) =>
        db[name].count().$.subscribe((n) => setCounts((c) => ({ ...c, [name]: n }))),
      );
    });
    return () => subscriptions.forEach((s) => s.unsubscribe());
  }, []);
  return (
    <p className="muted">
      On this device: {counts.note_folders ?? "…"} folders, {counts.notes ?? "…"} notes,{" "}
      {counts.voice_notes ?? "…"} voice notes
    </p>
  );
}
