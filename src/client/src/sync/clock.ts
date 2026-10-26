// The device's clock may be off. updated_at decides who wins a conflict, so it's taken from
// the device clock corrected by the offset to the server, measured from its Date header.

let offsetMs = 0;

/** Server time minus device time, or null if the header is missing or unreadable. */
export function offsetFrom(dateHeader: string | null, sentAt: number, receivedAt: number): number | null {
  if (!dateHeader) return null;
  const server = Date.parse(dateHeader);
  if (Number.isNaN(server)) return null;
  // The header has whole seconds; on average the real time is half a second later.
  // Compare with the middle of the request, when the server most likely answered.
  return server + 500 - (sentAt + receivedAt) / 2;
}

export function updateOffset(dateHeader: string | null, sentAt: number, receivedAt: number): void {
  const offset = offsetFrom(dateHeader, sentAt, receivedAt);
  if (offset !== null) offsetMs = offset;
}

/** Current time on the server's clock, as an ISO string — use for updated_at. */
export function serverNow(): string {
  return new Date(Date.now() + offsetMs).toISOString();
}
