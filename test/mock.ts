import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Config } from "../src/config.js";
import { PERMISSIONS, type Scope } from "../src/scopes.js";
import { buildServer } from "../src/server.js";

export interface Seen {
  method: string;
  url: string;
  authorization: string | undefined;
  body: unknown;
}

export type Reply = (seen: Seen) => { status: number; body?: unknown };

/** The server end of one WebSocket: just enough framing for JSON messages. */
export class MockSocket {
  readonly received: Record<string, unknown>[] = [];
  onMessage: (message: Record<string, unknown>) => void = () => {};
  private buffer = Buffer.alloc(0);

  constructor(private readonly socket: Socket) {
    socket.on("data", (chunk: Buffer) => this.read(chunk));
    socket.on("error", () => {});
  }

  send(message: unknown): void {
    const payload = Buffer.from(JSON.stringify(message));
    const header =
      payload.length < 126
        ? Buffer.from([0x81, payload.length])
        : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff]);
    this.socket.write(Buffer.concat([header, payload]));
  }

  close(): void {
    this.socket.destroy();
  }

  private read(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const opcode = (this.buffer[0] ?? 0) & 0x0f;
      let length = (this.buffer[1] ?? 0) & 0x7f;
      let offset = 2;
      if (length === 126) {
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      }
      // Clients always mask what they send.
      if (this.buffer.length < offset + 4 + length) return;
      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < payload.length; i++) payload[i] = (payload[i] ?? 0) ^ (mask[i % 4] ?? 0);
      this.buffer = this.buffer.subarray(offset + 4 + length);
      if (opcode === 8) {
        this.socket.end(Buffer.from([0x88, 0]));
        return;
      }
      if (opcode === 1) {
        const message = JSON.parse(payload.toString()) as Record<string, unknown>;
        this.received.push(message);
        this.onMessage(message);
      }
    }
  }
}

/** A stand-in for WorldAPI that records requests and answers with whatever a test wants. */
export class MockWorldApi {
  readonly seen: Seen[] = [];
  reply: Reply = () => ({ status: 200, body: { ok: true } });
  /** Called for each WebSocket client at /api/v1/ws. */
  onSocket: (socket: MockSocket) => void = (socket) => socket.close();
  readonly sockets: MockSocket[] = [];
  private server: Server | undefined;
  url = "";

  async start(): Promise<this> {
    this.server = createServer((request, response) => {
      let text = "";
      request.on("data", (chunk) => {
        text += chunk;
      });
      request.on("end", () => {
        const seen = {
          method: request.method ?? "",
          url: request.url ?? "",
          authorization: request.headers.authorization,
          body: text ? JSON.parse(text) : undefined,
        };
        this.seen.push(seen);
        const { status, body } = this.reply(seen);
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(body === undefined ? undefined : JSON.stringify(body));
      });
    });
    this.server.on("upgrade", (request, socket: Socket) => {
      const accept = createHash("sha1")
        .update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest("base64");
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
      );
      const mock = new MockSocket(socket);
      this.sockets.push(mock);
      this.onSocket(mock);
    });
    const server = this.server;
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    return this;
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.close();
    await new Promise((resolve) => this.server?.close(resolve));
  }
}

export const TOKEN = "secret-token-0123456789abcdef";

/** WorldAPI's default groups, resolved as its hello lists them. */
export const VIEWER: Scope[] = ["server:read", "players:read", "players:private", "events:read", "chat:read"];
export const ADMIN: Scope[] = PERMISSIONS.filter((scope) => scope !== "files:write" && scope !== "code");
export const OWNER: Scope[] = [...PERMISSIONS];

/** An MCP client connected in memory to a server built for these scopes. */
export async function connect(url: string, scopes: Scope[], options: Partial<Config> = {}) {
  const config: Config = { url, token: TOKEN, readOnly: false, ...options };
  const built = buildServer(config, new Set(scopes));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await built.server.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return { client, tools: built.tools };
}

export function text(result: unknown): string {
  return ((result as { content: { text: string }[] }).content ?? []).map((part) => part.text).join("");
}
