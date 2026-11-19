import { readFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { unwrap, type WorldApi } from "./client.js";
import { redact } from "./config.js";
import type { EventFeed } from "./events.js";
import { WEBHOOK_GUIDE } from "./guides.js";
import { fence, type Switch } from "./tool.js";

/**
 * Game text (chat, console lines, names, the MOTD) comes fenced as data, like an untrusted tool's result. The fence
 * wraps JSON in a sentence and tags, so the text isn't JSON any more: text/plain says so, and clients show text/plain
 * as it is instead of failing to parse it.
 */
const GAME = "text/plain";
const game = (uri: URL, value: unknown, token: string | undefined) => ({
  contents: [{ uri: uri.href, mimeType: GAME, text: fence(redact(JSON.stringify(value), token)) }],
});

/** Registers the resources and returns those the token's permissions switch on and off, all on for now. */
export function registerResources(
  server: McpServer,
  api: WorldApi,
  /** Read at every read: in singleplayer the token changes from world to world. */
  token: () => string | undefined,
  feed: EventFeed | undefined,
): Switch[] {
  server.registerResource(
    "server-status",
    "worldapi://server/status",
    {
      title: "Server status",
      description:
        "Version, players online, uptime, and TPS, fenced as game data: the MOTD and names come from players",
      mimeType: GAME,
    },
    async (uri) => {
      const key = token();
      const [status, performance] = await Promise.all([
        unwrap(api.GET("/server"), key),
        unwrap(api.GET("/server/performance"), key),
      ]);
      return game(uri, { status, performance }, key);
    },
  );

  server.registerResource(
    "online-players",
    "worldapi://players/online",
    { title: "Online players", description: "Who is playing right now, fenced as game data", mimeType: GAME },
    async (uri) => {
      const key = token();
      return game(uri, await unwrap(api.GET("/players/online"), key), key);
    },
  );

  // Our own document, not the game's: it stays plain JSON.
  server.registerResource(
    "openapi",
    "worldapi://openapi",
    {
      title: "WorldAPI OpenAPI document",
      description: "Every WorldAPI endpoint, as this server was built against",
      mimeType: "application/json",
    },
    async (uri) => {
      const text = await readFile(new URL("../openapi/worldapi.json", import.meta.url), "utf8");
      return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
    },
  );

  server.registerResource(
    "recent-events",
    "worldapi://events/recent",
    {
      title: "Recent events",
      description:
        "Joins, leaves, deaths, advancements, chat (with chat:read), skipped nights, boss kills, and server status, newest first, fenced as game data",
      mimeType: GAME,
    },
    async (uri) => {
      const key = token();
      // The live feed has events as they happen. Before it has any, the history fills in.
      const live = feed?.recent() ?? [];
      if (live.length > 0) return game(uri, { source: "live", events: live }, key);
      const history = await unwrap(api.GET("/events", { params: { query: { limit: 50 } } }), key);
      return game(uri, { source: "history", events: (history as { items?: unknown[] }).items ?? [] }, key);
    },
  );

  const consoleLines = server.registerResource(
    "console",
    "worldapi://server/console",
    {
      title: "Console",
      description:
        "The newest console lines, live from the server.console topic, fenced as game data: players write parts of them",
      mimeType: GAME,
    },
    async (uri) => {
      const key = token();
      // Lines seen live, oldest first like a console. Before there are any, WorldAPI's buffer fills in.
      const live = feed?.consoleLines() ?? [];
      if (live.length > 0) return game(uri, { source: "live", lines: live.reverse().map((event) => event.data) }, key);
      return game(uri, { source: "buffer", ...(await unwrap(api.GET("/server/logs"), key)) }, key);
    },
  );

  // How to connect Discord, Telegram, and the rest: only a token that can make webhooks needs it.
  const webhookGuide = server.registerResource(
    "webhook-guide",
    "worldapi://guide/webhooks",
    {
      title: "Connecting chats through webhooks",
      description: "Step by step, for each service manage_webhook can send to",
      mimeType: "text/markdown",
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: WEBHOOK_GUIDE }] }),
  );
  return [
    { name: "console", need: "logs:read", handle: consoleLines },
    { name: "webhook-guide", need: "webhooks:manage", handle: webhookGuide },
  ];
}
