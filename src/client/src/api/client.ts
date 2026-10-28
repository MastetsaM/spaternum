// Every call to the server goes through here: token header, clock offset, online status.

import { updateOffset } from "../sync/clock";
import { markOffline, markOnline, markTokenRejected } from "../sync/status";
import type { Settings } from "./settings";

export class ApiError extends Error {
  constructor(
    public status: number, // 0 = server not reachable
    message: string,
  ) {
    super(message);
  }
}

export async function call<T>(settings: Settings, path: string, init: RequestInit = {}): Promise<T> {
  const sentAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${settings.server}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${settings.token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch {
    markOffline();
    throw new ApiError(0, "server not reachable");
  }
  updateOffset(response.headers.get("Date"), sentAt, Date.now());

  if (response.status === 401) {
    markTokenRejected();
    throw new ApiError(401, "token rejected");
  }
  if (!response.ok) throw new ApiError(response.status, await response.text());
  markOnline();
  return response.json();
}
