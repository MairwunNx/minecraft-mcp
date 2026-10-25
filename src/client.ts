import createClient, { type Client } from "openapi-fetch";
import { type Config, redact } from "./config.js";
import type { paths } from "./generated/worldapi.js";
import { findLocalWorld, NO_WORLD } from "./local.js";

export type WorldApi = Client<paths>;

/** A failed call, carrying WorldAPI's own error code, such as `player_offline`. */
export class WorldApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** No singleplayer world is open: a local config has nowhere to send a call. */
export class NoWorldError extends Error {
  constructor() {
    super(NO_WORLD);
  }
}

/** Where calls go before a local config knows the world; each call swaps it for the open world's address. */
const LOCAL_BASE = "http://worldapi.local/api/v1";

export function createWorldApi(config: Config, fetchImpl: typeof fetch = fetch): WorldApi {
  if (config.local) {
    const folder = config.local.folder;
    // The world may close, and another open on another port, between two calls.
    const local: typeof fetch = async (input, init) => {
      const world = findLocalWorld(folder);
      if (!world) throw new NoWorldError();
      const request = input instanceof Request ? input : new Request(input, init);
      const target = request.url.replace(LOCAL_BASE, world.url.replace(/\/+$/, ""));
      const headers = new Headers(request.headers);
      const token = config.token;
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetchImpl(
        new Request(target, { method: request.method, headers, body: request.body, duplex: "half" } as RequestInit),
      );
    };
    return createClient<paths>({ baseUrl: LOCAL_BASE, fetch: local });
  }
  return createClient<paths>({
    baseUrl: config.url,
    fetch: fetchImpl,
    headers: config.token ? { Authorization: `Bearer ${config.token}` } : {},
  });
}

interface Outcome<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/**
 * Unwraps an openapi-fetch result: the data on success, a WorldApiError otherwise. A 204
 * comes back as `{ done: true }` so every tool has something to show.
 */
export async function unwrap<T>(call: Promise<Outcome<T>>, token?: string): Promise<T | { done: true }> {
  let outcome: Outcome<T>;
  try {
    outcome = await call;
  } catch (error) {
    if (error instanceof NoWorldError) throw new WorldApiError(0, "no_world", NO_WORLD);
    throw new WorldApiError(0, "unreachable", redact(`WorldAPI didn't answer: ${(error as Error).message}`, token));
  }
  const { data, error, response } = outcome;
  if (response.ok) return response.status === 204 || data === undefined ? { done: true } : data;
  const body = error as { error?: { code?: string; message?: string } } | undefined;
  throw new WorldApiError(
    response.status,
    body?.error?.code ?? `http_${response.status}`,
    redact(body?.error?.message ?? response.statusText, token),
  );
}
