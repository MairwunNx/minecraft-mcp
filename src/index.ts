#!/usr/bin/env node
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createWorldApi } from "./client.js";
import { configFromEnv } from "./config.js";
import { EventFeed } from "./events.js";
import { fromLoopback } from "./http.js";
import { findLocalWorld } from "./local.js";
import { discoverScopes, LOCAL } from "./scopes.js";
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
                      (a local world brings its own, which wins)
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
      ? `No singleplayer world with WorldAPI is open yet; tools will reach the next one opened (${config.local?.folder})`
      : `WorldAPI ${found.version ?? "(version unknown)"} on ${found.platform ?? "paper"} at ${config.url}; permissions: ${[...scopes].join(", ") || "none"}${config.readOnly ? "; read-only" : ""}`,
  );
  const where = { platform: found.platform, side: found.side, local: config.local !== undefined };

  if (!values.http) {
    const { server, tools } = buildServer(config, scopes, feed, undefined, where);
    log(`${tools.length} tools on stdio`);
    await server.connect(new StdioServerTransport());
    return;
  }

  const port = Number(values.port);
  const secret = process.env.MCP_HTTP_TOKEN?.trim();
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(values.host ?? "");
  if (!secret && !loopback) {
    // Anyone who reached the port would get the WorldAPI token's powers, so refuse instead of warning.
    log(`Set MCP_HTTP_TOKEN to listen on ${values.host}; without it only 127.0.0.1, ::1, or localhost are allowed`);
    // Exit outright: the scope probe may still hold a socket open.
    process.exit(1);
  }
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const authorized = (request: IncomingMessage) => {
    if (!secret) return true;
    const given = Buffer.from(request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "");
    const expected = Buffer.from(secret);
    return given.length === expected.length && timingSafeEqual(given, expected);
  };

  createServer(async (request, response) => {
    if (!request.url?.startsWith("/mcp")) {
      response.writeHead(404).end();
      return;
    }
    if (!authorized(request)) {
      response.writeHead(401, { "WWW-Authenticate": "Bearer" }).end();
      return;
    }
    // Without a token, only this machine's clients get in, not a web page that rebound its domain here.
    if (!secret && !fromLoopback(request.headers.host, request.headers.origin)) {
      response.writeHead(403).end();
      return;
    }
    const id = request.headers["mcp-session-id"];
    let transport = typeof id === "string" ? sessions.get(id) : undefined;
    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          if (transport) sessions.set(sessionId, transport);
        },
      });
      transport.onclose = () => {
        if (transport?.sessionId) sessions.delete(transport.sessionId);
      };
      await buildServer(config, scopes, feed, undefined, where).server.connect(transport);
    }
    await transport.handleRequest(request, response);
  }).listen(port, values.host, () => log(`Streamable HTTP on http://${values.host}:${port}/mcp`));
}

main().catch((error: Error) => {
  log(error.message);
  process.exit(1);
});
