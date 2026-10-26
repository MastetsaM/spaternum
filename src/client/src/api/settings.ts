// Server address and API token, kept in the webview's localStorage (only this app reads it).

export type Settings = { server: string; token: string };

const KEY = "spaternum.settings";

/** "raspberrypi.x.ts.net/" → "https://raspberrypi.x.ts.net" */
export function normalizeServer(input: string): string {
  let server = input.trim().replace(/\/+$/, "");
  if (server && !/^https?:\/\//i.test(server)) server = `https://${server}`;
  return server;
}

export function loadSettings(): Settings | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return value?.server && value?.token ? value : null;
  } catch {
    return null;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
