#!/usr/bin/env node
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWorldApi } from "./client.js";
import { configFromEnv } from "./config.js";
import { EventFeed } from "./events.js";
import { serveHttp } from "./http.js";
import { findLocalWorld } from "./local.js";
import { discoverScopes, LOCAL, Permissions } from "./scopes.js";
import { buildServer } from "./server.js";
import { checkWorldApi, VERSION } from "./version.js";

const HELP = `minecraft-mcp ${VERSION}: an MCP server for a Minecraft server running WorldAPI

Usage: minecraft-mcp [--http] [--host 127.0.0.1] [--port 3333]

  --http        Serve Streamable HTTP at /mcp instead of stdio
  --host        Address to listen on with --http (default 127.0.0.1)
  --port        Port to listen on with --http (default 3333)
  --help        Show this help
  --version     Show the version

Environment:
  WORLDAPI_URL        WorldAPI base URL, such as http://localhost:8110/api/v1; without
                      it, the singleplayer world open on this machine with the
                      WorldAPI mod, found again on every call
  WORLDAPI_TOKEN      WorldAPI token; its permissions decide which tools appear
                      (a local world brings its own and ignores this one)
  WORLDAPI_READ_ONLY  1 hides every tool that changes the server
  WORLDAPI_PLAYER     Your player name: “me” means this player, and tools that
                      take a player use it when the agent leaves one out
  MCP_HTTP_TOKEN      With --http, clients must send it as a bearer token
`;

// stdout belongs to the MCP protocol on stdio, so everything else goes to stderr.
const log = (line: string) => process.stderr.write(`[minecraft-mcp] ${line}\n`);

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      http: { type: "boolean", default: false },
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: "3333" },
      help: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
    },
  });
  if (values.help) return void process.stdout.write(HELP);
  if (values.version) return void process.stdout.write(`${VERSION}\n`);

  const config = configFromEnv();
  // Without WORLDAPI_URL the game may not run yet: then the tools are a local world's, whose token is the admin group.
  const waiting = config.local !== undefined && findLocalWorld(config.local.folder) === undefined;
  const [scopes, found] = waiting
    ? [new Set(LOCAL), { platform: "fabric", side: "integrated" }]
    : await Promise.all([discoverScopes(config, log), checkWorldApi(createWorldApi(config), log)]);
  const feed = new EventFeed(config);
  feed.start();
  log(
    waiting
      ? `No singleplayer world with WorldAPI is open yet. Tools will reach the next one opened (${config.local?.folder})`
      : `WorldAPI ${found.version ?? "(version unknown)"} on ${found.platform ?? "paper"} at ${config.url}; permissions: ${[...scopes].join(", ") || "none"}${config.readOnly ? ". Read-only" : ""}`,
  );
  const where = { platform: found.platform, side: found.side, local: config.local !== undefined };
  // One store for every session: a token changed in WorldAPI's panel, or another singleplayer world, needs no restart.
  const permissions = new Permissions(scopes, config, log);
  permissions.start();

  if (!values.http) {
    const { server, tools } = buildServer(config, permissions, feed, undefined, where);
    log(`${tools.length} tools on stdio`);
    await server.connect(new StdioServerTransport());
    return;
  }

  // Refuses to listen beyond the loopback without MCP_HTTP_TOKEN: anyone who reached the port would get the token's powers.
  const host = values.host ?? "127.0.0.1";
  await serveHttp({
    build: () => buildServer(config, permissions, feed, undefined, where).server,
    host,
    port: Number(values.port),
    secret: process.env.MCP_HTTP_TOKEN?.trim() || undefined,
    log,
  });
  log(`Streamable HTTP on http://${host}:${values.port}/mcp`);
}

main().catch((error: Error) => {
  log(error.message);
  // Exit outright: the scope probe or the event feed may still hold a socket open.
  process.exit(1);
});
