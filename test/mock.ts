import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Config } from "../src/config.js";
import type { Scope } from "../src/scopes.js";
import { buildServer } from "../src/server.js";

export interface Seen {
  method: string;
  url: string;
  authorization: string | undefined;
  body: unknown;
}

export type Reply = (seen: Seen) => { status: number; body?: unknown };

/** A stand-in for WorldAPI that records requests and answers with whatever a test wants. */
export class MockWorldApi {
  readonly seen: Seen[] = [];
  reply: Reply = () => ({ status: 200, body: { ok: true } });
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
    const server = this.server;
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    return this;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.server?.close(resolve));
  }
}

export const TOKEN = "secret-token-0123456789abcdef";

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
