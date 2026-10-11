import createClient, { type Client } from "openapi-fetch";
import { type Config, redact } from "./config.js";
import type { paths } from "./generated/worldapi.js";

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

export function createWorldApi(config: Config, fetchImpl: typeof fetch = fetch): WorldApi {
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
