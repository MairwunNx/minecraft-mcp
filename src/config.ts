import { findLocalWorld, localFolder } from "./local.js";

/** Settings from the environment. The token stays in memory and never reaches a log or a tool result. */
export interface Config {
  /** WorldAPI base URL including the base path, such as http://localhost:8110/api/v1. */
  readonly url: string;
  readonly token: string | undefined;
  readOnly: boolean;
  /** The user's own player, from WORLDAPI_PLAYER: tools that take a player default to it. */
  player?: string | undefined;
  /**
   * Without WORLDAPI_URL: the singleplayer world open on this machine, looked up again on every call, since the
   * player may leave it and open another. Undefined while none is open.
   */
  local?: { folder: string } | undefined;
}

/** Where a local config points while no world is open; calls then fail with a hint instead. */
export const NO_WORLD_URL = "http://127.0.0.1:8110/api/v1";

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  const url = env.WORLDAPI_URL?.trim();
  if (!url) {
    // A singleplayer world with the WorldAPI mod says where it is in a file of its own.
    const folder = localFolder(env);
    const fixed = env.WORLDAPI_TOKEN?.trim() || undefined;
    return {
      get url() {
        return findLocalWorld(folder)?.url.replace(/\/+$/, "") ?? NO_WORLD_URL;
      },
      // The world's own token first: a WORLDAPI_TOKEN left in a shell profile belongs to some server, not to this game.
      get token() {
        return findLocalWorld(folder)?.token ?? fixed;
      },
      readOnly: ["1", "true", "yes"].includes((env.WORLDAPI_READ_ONLY ?? "").toLowerCase()),
      player: env.WORLDAPI_PLAYER?.trim() || undefined,
      local: { folder },
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`WORLDAPI_URL isn't a URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error("WORLDAPI_URL must use http or https");
  return {
    url: url.replace(/\/+$/, ""),
    token: env.WORLDAPI_TOKEN?.trim() || undefined,
    readOnly: ["1", "true", "yes"].includes((env.WORLDAPI_READ_ONLY ?? "").toLowerCase()),
    player: env.WORLDAPI_PLAYER?.trim() || undefined,
  };
}

/** Replaces every occurrence of the token, for anything that might end up in a message. */
export function redact(text: string, token: string | undefined): string {
  return token ? text.split(token).join("[token]") : text;
}
