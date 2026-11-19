import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/** Names a browser uses for this machine; a page on another name that reaches the port came by DNS rebinding. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostname(host: string): string {
  // "[::1]:3333" keeps its brackets; "localhost:3333" drops the port.
  return (host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : (host.split(":")[0] ?? "")).toLowerCase();
}

/**
 * Whether a request to a loopback server without MCP_HTTP_TOKEN comes from this machine's own
 * clients. A web page can point its own domain at 127.0.0.1 and call the port as if it were
 * the same site; its requests then carry that domain in Host and Origin, so both must name
 * the loopback.
 */
export function fromLoopback(host: string | undefined, origin: string | undefined): boolean {
  if (!host || !LOOPBACK.has(hostname(host))) return false;
  if (origin === undefined) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && LOOPBACK.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Hosts the server may listen on without MCP_HTTP_TOKEN. */
const LISTEN_LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

/** How long a session may go without a request before the server closes it: most clients never send DELETE. */
export const SESSION_IDLE_MS = 30 * 60_000;

/** Refused to start: listening beyond the loopback without a token would hand the WorldAPI token to anyone. */
export class HttpRefusal extends Error {}

export interface HttpOptions {
  /** Builds a fresh MCP server for each new session. */
  build: () => McpServer;
  host: string;
  /** 0 picks a free port. */
  port: number;
  /** MCP_HTTP_TOKEN: clients must send it as a bearer token. */
  secret?: string | undefined;
  log?: (line: string) => void;
  idleMs?: number;
}

export interface HttpServer {
  server: Server;
  /** The port it listens on, the chosen one when asked for 0. */
  port: number;
  /** How many sessions are open now. */
  sessions(): number;
  close(): Promise<void>;
}

/** Compares a bearer token in constant time: hashing both sides first hides the secret's length too. */
export function bearerMatches(header: string | undefined, secret: string): boolean {
  const given = /^Bearer +(\S+) *$/i.exec(header ?? "")?.[1];
  if (given === undefined) return false;
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(given), digest(secret));
}

interface Session {
  transport: StreamableHTTPServerTransport;
  /** When the last request ended, or started while one is still open. */
  seen: number;
  /** Requests still open, such as a GET that streams server messages: the session isn't idle while one is. */
  open: number;
}

/**
 * Serves Streamable HTTP at /mcp. Without [secret] it listens only on the loopback and answers only
 * requests whose Host and Origin name it, against DNS rebinding.
 */
export async function serveHttp(options: HttpOptions): Promise<HttpServer> {
  const { build, host, secret, log = () => {}, idleMs = SESSION_IDLE_MS } = options;
  if (!secret && !LISTEN_LOOPBACK.has(host))
    throw new HttpRefusal(
      `Set MCP_HTTP_TOKEN to listen on ${host}. Without it only 127.0.0.1, ::1, or localhost are allowed`,
    );
  const sessions = new Map<string, Session>();

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.url?.split("?")[0] !== "/mcp") {
      response.writeHead(404).end();
      return;
    }
    if (secret && !bearerMatches(request.headers.authorization, secret)) {
      response.writeHead(401, { "WWW-Authenticate": "Bearer" }).end();
      return;
    }
    // Without a token, only this machine's clients get in, not a web page that rebound its domain here.
    if (!secret && !fromLoopback(request.headers.host, request.headers.origin)) {
      response.writeHead(403).end();
      return;
    }
    const id = request.headers["mcp-session-id"];
    if (id !== undefined) {
      const session = typeof id === "string" ? sessions.get(id) : undefined;
      if (!session) {
        // A session from before a restart, or one closed while idle: 404 tells the client to start a new one.
        response
          .writeHead(404, { "Content-Type": "application/json" })
          .end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null }));
        return;
      }
      session.open++;
      session.seen = Date.now();
      response.on("close", () => {
        session.open--;
        session.seen = Date.now();
      });
      await session.transport.handleRequest(request, response);
      return;
    }
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, { transport, seen: Date.now(), open: 0 });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await build().connect(transport);
    await transport.handleRequest(request, response);
    // Anything but an initialize leaves no session behind: don't keep its server around either.
    if (!transport.sessionId) await transport.close();
  };

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      log(`HTTP request failed: ${(error as Error)?.message ?? String(error)}`);
      if (!response.headersSent) response.writeHead(500).end();
      else response.end();
    });
  });

  const sweep = setInterval(
    () => {
      const now = Date.now();
      for (const [id, session] of sessions) {
        if (session.open > 0 || now - session.seen < idleMs) continue;
        sessions.delete(id);
        session.transport.close().catch(() => {});
      }
    },
    Math.max(Math.min(idleMs, 60_000), 10),
  );
  sweep.unref();

  await new Promise<void>((resolve, reject) => {
    server.once("error", (error) => {
      clearInterval(sweep);
      reject(error);
    });
    server.listen(options.port, host, () => resolve());
  });
  return {
    server,
    port: (server.address() as AddressInfo).port,
    sessions: () => sessions.size,
    close: async () => {
      clearInterval(sweep);
      for (const session of sessions.values()) await session.transport.close().catch(() => {});
      sessions.clear();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
