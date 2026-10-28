// The server's live stream (/api/events): each event names a table that changed.
// Read with fetch because EventSource can't send the token header.

import type { Settings } from "../api/settings";
import { updateOffset } from "./clock";
import { markOffline, markOnline, markTokenRejected } from "./status";

/** Pause before reconnecting: 1 s, 2 s, 4 s … up to 30 s. */
export function reconnectDelay(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** attempt);
}

/** Table names from complete events in the buffer, plus the unfinished rest. */
export function parseEvents(buffer: string): { tables: string[]; rest: string } {
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";
  const tables = blocks.flatMap((block) =>
    block
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice("data: ".length).trim()),
  );
  return { tables, rest };
}

// The server sends a keepalive every 25 s; silence for longer means a dead connection
// (common on phones switching networks), so give up on it and reconnect.
const SILENCE_MS = 60_000;

type Handlers = {
  onTable: (table: string) => void;
  onConnect: () => void; // also after a reconnect: pull everything to catch up
};

/** Keeps the stream open until stop() is called. */
export function listen(settings: Settings, { onTable, onConnect }: Handlers): () => void {
  let stopped = false;
  let current: AbortController | null = null;

  async function connectOnce(): Promise<"retry" | "stop"> {
    const controller = new AbortController();
    current = controller;
    let watchdog = setTimeout(() => controller.abort(), SILENCE_MS);
    const keepAlive = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => controller.abort(), SILENCE_MS);
    };
    try {
      const sentAt = Date.now();
      const response = await fetch(`${settings.server}/api/events`, {
        headers: { Authorization: `Bearer ${settings.token}` },
        signal: controller.signal,
      });
      updateOffset(response.headers.get("Date"), sentAt, Date.now());
      if (response.status === 401) {
        markTokenRejected();
        return "stop";
      }
      if (!response.ok || !response.body) return "retry";

      markOnline();
      onConnect();
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return "retry";
        keepAlive();
        const parsed = parseEvents(buffer + value);
        buffer = parsed.rest;
        parsed.tables.forEach(onTable);
      }
    } catch {
      return "retry";
    } finally {
      clearTimeout(watchdog);
    }
  }

  (async () => {
    let attempt = 0;
    while (!stopped) {
      const startedAt = Date.now();
      if ((await connectOnce()) === "stop" || stopped) return;
      markOffline();
      // A connection that lasted a while starts the pauses over
      if (Date.now() - startedAt > SILENCE_MS) attempt = 0;
      await new Promise((resolve) => setTimeout(resolve, reconnectDelay(attempt++)));
    }
  })();

  return () => {
    stopped = true;
    current?.abort();
  };
}
