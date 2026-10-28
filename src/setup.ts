import { type Config, redact } from "./config.js";
import { findLocalWorld } from "./local.js";
import { discoverScopes, MISSING } from "./scopes.js";
import { MIN_WORLDAPI, olderThan } from "./version.js";

/** Where WorldAPI comes from, by platform, and the pages that set it up. */
export const LINKS = {
  paper: [
    "https://modrinth.com/plugin/worldapi",
    "https://hangar.papermc.io/MairwunNx/WorldAPI",
    "https://github.com/MairwunNx/minecraft-worldapi/releases/latest/download/worldapi-paper.jar",
  ],
  fabric: [
    "https://modrinth.com/plugin/worldapi",
    "https://github.com/MairwunNx/minecraft-worldapi/releases/latest/download/worldapi-fabric.jar",
  ],
  neoforge: [
    "https://modrinth.com/plugin/worldapi",
    "https://github.com/MairwunNx/minecraft-worldapi/releases/latest/download/worldapi-neoforge.jar",
  ],
  installation: "https://github.com/MairwunNx/minecraft-worldapi/wiki/Installation",
  singleplayer: "https://github.com/MairwunNx/minecraft-worldapi/wiki/Singleplayer",
  tokens: "https://github.com/MairwunNx/minecraft-worldapi/wiki/Tokens-and-permissions",
  reverseProxy: "https://github.com/MairwunNx/minecraft-worldapi/wiki/Reverse-proxy",
  mcp: "https://github.com/MairwunNx/minecraft-mcp/wiki/Installation",
} as const;

const TOKEN_HOW =
  "Make a token for this agent: in the game, an operator runs `/worldapi mcp <name> [group]` and presses the button for this AI client to copy its setup; or in WorldAPI's admin panel (`/worldapi admin` in game opens it), Tokens → New token → AI agent (MCP). Groups: viewer reads, moderator also moderates players, admin runs the server. Then put the token in this MCP server's settings as WORLDAPI_TOKEN and restart the AI client.";

const URL_HOW =
  "Set WORLDAPI_URL in this MCP server's settings to WorldAPI's address, such as http://localhost:8110/api/v1 on the same machine or https://example.com/worldapi/api/v1 behind a proxy, then restart the AI client.";

export interface Diagnosis {
  /** `ready` when everything works; otherwise the first thing to fix. */
  state: "ready" | "no_world" | "unreachable" | "not_worldapi" | "token_rejected" | "no_token" | "outdated";
  url?: string;
  worldApi?: { version?: string; platform?: string; side?: string };
  token: "none" | "accepted" | "rejected";
  permissions?: string[];
  /** What this token can't do, so the agent can say what to ask for. */
  cannot?: string[];
  readOnly: boolean;
  /** What to tell the user, in order. */
  steps: string[];
  links: Record<string, string | readonly string[]>;
}

/**
 * Works out why tools fail or are missing: no world open, WorldAPI out of reach or not there, a token that's missing,
 * wrong, or too weak, and says what the user does about each, in the game, in the panel, or in this server's settings.
 */
export async function diagnose(config: Config, fetchImpl: typeof fetch = fetch): Promise<Diagnosis> {
  const links = { ...LINKS };
  // The links go last, so a reader sees the state and the steps first.
  const base = { readOnly: config.readOnly, links } as const;
  if (config.local && !findLocalWorld(config.local.folder)) {
    return {
      state: "no_world",
      token: "none",
      steps: [
        "This MCP server has no WORLDAPI_URL, so it looks for a singleplayer world open on this machine with the WorldAPI mod, and none is open.",
        `Playing alone: put the WorldAPI mod for Fabric or NeoForge into the game's mods folder (${LINKS.fabric[0]}), start the game, and open a world. Nothing else to set: ${LINKS.singleplayer}`,
        `A server instead: install WorldAPI there (Paper: ${LINKS.paper[0]}; Fabric or NeoForge: the same page), then ${URL_HOW}`,
        TOKEN_HOW,
      ],
      ...base,
    };
  }
  const url = config.url.replace(/\/+$/, "");
  let server: { worldApiVersion?: string; platform?: string; side?: string } | undefined;
  try {
    const response = await fetchImpl(`${url}/server`, { signal: AbortSignal.timeout(8_000) });
    const body = response.ok ? ((await response.json().catch(() => undefined)) as typeof server) : undefined;
    if (!body?.worldApiVersion) {
      return {
        state: "not_worldapi",
        url,
        token: "none",
        steps: [
          `Something answers at ${url}, but not WorldAPI (HTTP ${response.status} at /server). The address must end with WorldAPI's base path, /api/v1 by default, after any proxy prefix: such as http://host:8110/api/v1 or https://example.com/worldapi/api/v1.`,
          URL_HOW,
          `If WorldAPI isn't installed on that server yet: Paper ${LINKS.paper[0]}, Fabric or NeoForge ${LINKS.fabric[0]}; setup: ${LINKS.installation}`,
        ],
        ...base,
      };
    }
    server = body;
  } catch (error) {
    return {
      state: "unreachable",
      url,
      token: "none",
      steps: [
        `WorldAPI doesn't answer at ${url} (${redact((error as Error).message, config.token)}).`,
        "Check that the Minecraft server runs, that WorldAPI loaded (its log says “Listening on … endpoints”), and that the address and port are right: 8110 by default. From another machine the port must be open, or WorldAPI must sit behind a reverse proxy: " +
          LINKS.reverseProxy,
        `WorldAPI not installed yet? Paper: ${LINKS.paper.join(" or ")}. Fabric: ${LINKS.fabric.join(" or ")}. NeoForge: ${LINKS.neoforge.join(" or ")}. It goes into plugins/ (Paper) or mods/ (Fabric, NeoForge), then a restart. Setup: ${LINKS.installation}`,
        URL_HOW,
      ],
      ...base,
    };
  }
  const worldApi = { version: server.worldApiVersion, platform: server.platform ?? "paper", side: server.side };
  let rejected = false;
  const scopes = await discoverScopes(config, (line) => {
    if (config.token && !/no answer|can't connect/.test(line)) rejected = true;
  });
  const permissions = [...scopes];
  const cannot = MISSING.filter(([scope]) => !scopes.has(scope)).map(([, what]) => what);
  const steps: string[] = [];
  let state: Diagnosis["state"] = "ready";
  if (worldApi.version && olderThan(worldApi.version, MIN_WORLDAPI)) {
    state = "outdated";
    steps.push(
      `WorldAPI ${worldApi.version} is older than ${MIN_WORLDAPI}, which this MCP server expects: update it from ${LINKS.paper[0]}.`,
    );
  }
  if (config.token && rejected) {
    state = "token_rejected";
    steps.push(
      "WorldAPI didn't accept WORLDAPI_TOKEN: it was revoked, expired, mistyped, or belongs to another server.",
      TOKEN_HOW,
    );
  } else if (!config.token && !config.local) {
    if (state === "ready") state = "no_token";
    steps.push(
      "There's no WORLDAPI_TOKEN, so only what WorldAPI shows everyone works: the server, players, and public events, without coordinates or chat.",
      TOKEN_HOW,
    );
  } else if (cannot.length) {
    steps.push(
      `This token can't ${cannot.join("; ")}. If the user wants that, a token from a stronger group (moderator or admin) does it: ${TOKEN_HOW}`,
    );
  }
  if (config.readOnly)
    steps.push(
      "Read-only mode is on (WORLDAPI_READ_ONLY): nothing here changes the server, whatever the token allows.",
    );
  if (!steps.length) steps.push("Everything works: WorldAPI answers and the token is accepted.");
  return {
    state,
    url,
    worldApi,
    token: config.token ? (rejected ? "rejected" : "accepted") : "none",
    permissions,
    cannot,
    steps,
    ...base,
  };
}
