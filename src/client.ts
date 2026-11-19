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

/** How long a call may take: a hung server must not hang the tool with it. */
export const CALL_TIMEOUT_MS = 30_000;

/** The timeout's message: the agent passes it on to the user as it is. */
export const TIMEOUT_MESSAGE = "WorldAPI didn't answer within 30 seconds: the server may be busy or frozen.";

/** Gives a request a deadline, keeping whatever signal it already had. */
function withDeadline(request: Request, url: string, headers: Headers, timeoutMs: number): Request {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
  return new Request(url, {
    method: request.method,
    headers,
    body: request.body,
    signal,
    duplex: "half",
  } as RequestInit);
}

/** Where calls go before a local config knows the world; each call swaps it for the open world's address. */
const LOCAL_BASE = "http://worldapi.local/api/v1";

export function createWorldApi(
  config: Config,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = CALL_TIMEOUT_MS,
): WorldApi {
  if (config.local) {
    const folder = config.local.folder;
    // The world may close, and another open on another port, between two calls.
    const local: typeof fetch = async (input, init) => {
      const world = findLocalWorld(folder);
      if (!world) throw new NoWorldError();
      const request = input instanceof Request ? input : new Request(input, init);
      const target = request.url.replace(LOCAL_BASE, world.url.replace(/\/+$/, ""));
      const headers = new Headers(request.headers);
      // The token from the same file as the address: a second lookup could find another world.
      if (world.token) headers.set("Authorization", `Bearer ${world.token}`);
      return fetchImpl(withDeadline(request, target, headers, timeoutMs));
    };
    return createClient<paths>({ baseUrl: LOCAL_BASE, fetch: local });
  }
  const remote: typeof fetch = (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    return fetchImpl(withDeadline(request, request.url, new Headers(request.headers), timeoutMs));
  };
  return createClient<paths>({
    baseUrl: config.url,
    fetch: remote,
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
    if ((error as Error | undefined)?.name === "TimeoutError") throw new WorldApiError(0, "timeout", TIMEOUT_MESSAGE);
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
