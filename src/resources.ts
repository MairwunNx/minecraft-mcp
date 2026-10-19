import { readFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { unwrap, type WorldApi } from "./client.js";
import { redact } from "./config.js";
import type { EventFeed } from "./events.js";
import { grants, type Scope } from "./scopes.js";

const json = (uri: URL, value: unknown, token: string | undefined) => ({
  contents: [{ uri: uri.href, mimeType: "application/json", text: redact(JSON.stringify(value), token) }],
});

export function registerResources(
  server: McpServer,
  api: WorldApi,
  token: string | undefined,
  scopes: ReadonlySet<Scope>,
  feed: EventFeed | undefined,
): void {
  server.registerResource(
    "server-status",
    "worldapi://server/status",
    { title: "Server status", description: "Version, players online, uptime, and TPS", mimeType: "application/json" },
    async (uri) => {
      const [status, performance] = await Promise.all([
        unwrap(api.GET("/server"), token),
        unwrap(api.GET("/server/performance"), token),
      ]);
      return json(uri, { status, performance }, token);
    },
  );

  server.registerResource(
    "online-players",
    "worldapi://players/online",
    { title: "Online players", description: "Who is playing right now", mimeType: "application/json" },
    async (uri) => json(uri, await unwrap(api.GET("/players/online"), token), token),
  );

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
        "Joins, leaves, deaths, advancements, chat (with chat:read), skipped nights, boss kills, and server status, newest first",
      mimeType: "application/json",
    },
    async (uri) => {
      // The live feed has events as they happen; before it has any, the history fills in.
      const live = feed?.recent() ?? [];
      if (live.length > 0) return json(uri, { source: "live", events: live }, token);
      const history = await unwrap(api.GET("/events", { params: { query: { limit: 50 } } }), token);
      return json(uri, { source: "history", events: (history as { items?: unknown[] }).items ?? [] }, token);
    },
  );

  if (grants(scopes, "logs:read"))
    server.registerResource(
      "console",
      "worldapi://server/console",
      {
        title: "Console",
        description: "The newest console lines, live from the server.console topic; players write parts of them",
        mimeType: "application/json",
      },
      async (uri) => {
        // Lines seen live, oldest first like a console; before there are any, WorldAPI's buffer fills in.
        const live = feed?.consoleLines() ?? [];
        if (live.length > 0)
          return json(uri, { source: "live", lines: live.reverse().map((event) => event.data) }, token);
        return json(uri, { source: "buffer", ...(await unwrap(api.GET("/server/logs"), token)) }, token);
      },
    );
}
