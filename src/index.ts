#!/usr/bin/env node
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { configFromEnv } from "./config.js";
import { EventFeed } from "./events.js";
import { discoverScopes } from "./scopes.js";
import { buildServer, VERSION } from "./server.js";

const HELP = `minecraft-mcp ${VERSION}: an MCP server for a Minecraft server running WorldAPI

Usage: minecraft-mcp [--http] [--host 127.0.0.1] [--port 3333]

  --http        Serve Streamable HTTP at /mcp instead of stdio
  --host        Address to listen on with --http (default 127.0.0.1)
  --port        Port to listen on with --http (default 3333)
  --help        Show this help
  --version     Show the version

Environment:
  WORLDAPI_URL        WorldAPI base URL, such as http://localhost:8100/api/v1 (required)
  WORLDAPI_TOKEN      WorldAPI token; its scopes decide which tools appear
  WORLDAPI_READ_ONLY  1 hides every tool that changes the server
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
  const scopes = await discoverScopes(config, log);
  const feed = new EventFeed(config);
  feed.start();
  log(`WorldAPI at ${config.url}; scopes: ${[...scopes].join(", ") || "none"}${config.readOnly ? "; read-only" : ""}`);

  if (!values.http) {
    const { server, tools } = buildServer(config, scopes, feed);
    log(`${tools.length} tools on stdio`);
    await server.connect(new StdioServerTransport());
    return;
  }

  const port = Number(values.port);
  const secret = process.env.MCP_HTTP_TOKEN?.trim();
  if (!secret && values.host !== "127.0.0.1" && values.host !== "localhost") {
    log(
      "Listening beyond localhost without MCP_HTTP_TOKEN: anyone who can reach the port gets the WorldAPI token's powers",
    );
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
      await buildServer(config, scopes, feed).server.connect(transport);
    }
    await transport.handleRequest(request, response);
  }).listen(port, values.host, () => log(`Streamable HTTP on http://${values.host}:${port}/mcp`));
}

main().catch((error: Error) => {
  log(error.message);
  process.exit(1);
});
