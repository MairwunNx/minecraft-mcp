import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { bearerMatches, fromLoopback, HttpRefusal, type HttpServer, serveHttp } from "../src/http.js";
import { buildServer } from "../src/server.js";
import { VIEWER } from "./mock.js";

describe("loopback HTTP without a token", () => {
  it("lets in this machine's clients", () => {
    expect(fromLoopback("127.0.0.1:3333", undefined)).toBe(true);
    expect(fromLoopback("localhost:3333", "http://localhost:6274")).toBe(true);
    expect(fromLoopback("[::1]:3333", "http://[::1]:5173")).toBe(true);
  });

  it("refuses a page that rebound its domain to the loopback", () => {
    expect(fromLoopback("evil.example:3333", undefined)).toBe(false);
    expect(fromLoopback("127.0.0.1:3333", "https://evil.example")).toBe(false);
    expect(fromLoopback("localhost.evil.example:3333", undefined)).toBe(false);
    expect(fromLoopback(undefined, undefined)).toBe(false);
    expect(fromLoopback("127.0.0.1:3333", "null")).toBe(false);
  });
});

const config: Config = { url: "http://127.0.0.1:1/api/v1", token: "t", readOnly: false };
const build = () => buildServer(config, new Set(VIEWER)).server;

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } },
};

/** A raw request, so a test can set Host the way a rebinding page would. */
function call(
  port: number,
  options: { path?: string; method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((resolve, reject) => {
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: options.path ?? "/mcp",
        method: options.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...options.headers,
        },
      },
      (response) => {
        let text = "";
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: text }));
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}

describe("the HTTP server", () => {
  let running: HttpServer | undefined;
  afterEach(async () => {
    await running?.close();
    running = undefined;
  });

  it("refuses to listen beyond the loopback without a token", async () => {
    await expect(serveHttp({ build, host: "0.0.0.0", port: 0 })).rejects.toBeInstanceOf(HttpRefusal);
  });

  it("asks for the bearer token, and compares it whole", async () => {
    running = await serveHttp({ build, host: "127.0.0.1", port: 0, secret: "s3cret" });
    expect((await call(running.port, { body: INITIALIZE })).status).toBe(401);
    for (const authorization of ["Bearer wrong", "Bearer s3cre", "s3cret", "Basic s3cret", "Bearer s3cret extra"])
      expect((await call(running.port, { body: INITIALIZE, headers: { Authorization: authorization } })).status).toBe(
        401,
      );
    const ok = await call(running.port, { body: INITIALIZE, headers: { Authorization: "Bearer s3cret" } });
    expect(ok.status).toBe(200);
  });

  it("refuses a foreign Host or Origin without a token", async () => {
    running = await serveHttp({ build, host: "127.0.0.1", port: 0 });
    expect((await call(running.port, { body: INITIALIZE, headers: { Host: "evil.example" } })).status).toBe(403);
    expect((await call(running.port, { body: INITIALIZE, headers: { Origin: "https://evil.example" } })).status).toBe(
      403,
    );
    expect((await call(running.port, { body: INITIALIZE })).status).toBe(200);
  });

  it("serves only /mcp", async () => {
    running = await serveHttp({ build, host: "127.0.0.1", port: 0 });
    expect((await call(running.port, { path: "/mcpfoo", body: INITIALIZE })).status).toBe(404);
    expect((await call(running.port, { path: "/", body: INITIALIZE })).status).toBe(404);
    expect((await call(running.port, { path: "/mcp?x=1", body: INITIALIZE })).status).toBe(200);
  });

  it("answers 404 for a session it doesn't know, so the client starts a new one", async () => {
    running = await serveHttp({ build, host: "127.0.0.1", port: 0 });
    const stale = await call(running.port, {
      headers: { "mcp-session-id": "0b8f6a3e-0000-0000-0000-000000000000" },
      body: { jsonrpc: "2.0", id: 2, method: "tools/list" },
    });
    expect(stale.status).toBe(404);
    expect(running.sessions()).toBe(0);
  });

  it("keeps a session for its requests, and closes it once idle", async () => {
    running = await serveHttp({ build, host: "127.0.0.1", port: 0, idleMs: 200 });
    const init = await call(running.port, { body: INITIALIZE });
    const id = String(init.headers["mcp-session-id"]);
    expect(running.sessions()).toBe(1);
    const headers = { "mcp-session-id": id, "mcp-protocol-version": "2025-06-18" };
    await call(running.port, { headers, body: { jsonrpc: "2.0", method: "notifications/initialized" } });
    const list = await call(running.port, { headers, body: { jsonrpc: "2.0", id: 2, method: "tools/list" } });
    expect(list.status).toBe(200);
    expect(list.body).toContain("get_server_status");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(running.sessions()).toBe(0);
    expect((await call(running.port, { headers, body: { jsonrpc: "2.0", id: 3, method: "tools/list" } })).status).toBe(
      404,
    );
  });

  it("answers 500 when building a session fails, instead of an unhandled rejection", async () => {
    running = await serveHttp({
      build: () => {
        throw new Error("boom");
      },
      host: "127.0.0.1",
      port: 0,
    });
    expect((await call(running.port, { body: INITIALIZE })).status).toBe(500);
  });
});

describe("bearerMatches", () => {
  it("needs the Bearer scheme and the whole token", () => {
    expect(bearerMatches("Bearer abc", "abc")).toBe(true);
    expect(bearerMatches("bearer abc", "abc")).toBe(true);
    expect(bearerMatches("abc", "abc")).toBe(false);
    expect(bearerMatches("Bearer abcd", "abc")).toBe(false);
    expect(bearerMatches(undefined, "abc")).toBe(false);
  });
});
