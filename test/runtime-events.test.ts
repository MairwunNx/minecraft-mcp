import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configFromEnv } from "../src/config.js";
import { EventFeed, waitForEvent } from "../src/events.js";
import { discoverScopes } from "../src/scopes.js";
import { type MockSocket, MockWorldApi, TOKEN } from "./mock.js";

/** Writes a frame MockSocket can't: HTML text from a proxy, or a binary frame. */
function sendRaw(mock: MockSocket, opcode: number, payload: string) {
  const data = Buffer.from(payload);
  const socket = (mock as unknown as { socket: Socket }).socket;
  socket.write(Buffer.concat([Buffer.from([0x80 | opcode, data.length]), data]));
}

const chat = { type: "player.chat", at: "2026-10-13T12:00:00Z", data: { message: "hi" } };

/** Greets like WorldAPI, after junk a proxy might send, and answers the subscription with [events]. */
function greet(api: MockWorldApi, topics: string[], events: unknown[] = []) {
  api.onSocket = (socket) => {
    socket.onMessage = (message) => {
      if (message.op === "auth") socket.send({ op: "authenticated", name: "agent", scopes: ["server:read"], topics });
      if (message.op === "subscribe") {
        socket.send({ op: "subscribed", topics: message.topics });
        sendRaw(socket, 1, "<html>502</html>");
        for (const event of events) socket.send({ op: "event", topic: "player.chat", event });
      }
    };
    sendRaw(socket, 1, "<html>Bad Gateway</html>");
    sendRaw(socket, 2, "\x01\x02binary");
    sendRaw(socket, 1, "null");
    socket.send({ op: "hello", heartbeatSeconds: 20, authenticated: false, scopes: [], topics: [] });
  };
}

let api: MockWorldApi;
let other: MockWorldApi;
let folder: string;
beforeEach(async () => {
  api = await new MockWorldApi().start();
  other = await new MockWorldApi().start();
  folder = mkdtempSync(join(tmpdir(), "worldapi-feed-"));
});
afterEach(async () => {
  await api.stop();
  await other.stop();
  rmSync(folder, { recursive: true, force: true });
});

function announce(port: string, url: string, token: string) {
  const world = {
    url,
    token,
    world: "W",
    platform: "fabric",
    version: "4.6.0",
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(join(folder, `${port}.json`), JSON.stringify(world));
}

describe("frames that aren't JSON", () => {
  it("are skipped by the permission probe", async () => {
    greet(api, []);
    const scopes = await discoverScopes({ url: api.url, token: TOKEN, readOnly: false }, () => {});
    expect([...scopes]).toEqual(["server:read"]);
  });

  it("are skipped by wait_for_event", async () => {
    greet(api, ["player.chat"], [chat]);
    const result = await waitForEvent({ url: api.url, token: TOKEN }, { types: ["player.chat"], timeoutMs: 5000 });
    expect(result).toEqual({ event: chat, topic: "player.chat" });
  });

  it("are skipped by the event feed", async () => {
    greet(api, ["player.chat"], [chat]);
    const feed = new EventFeed({ url: api.url, token: TOKEN, readOnly: false });
    feed.start();
    await vi.waitFor(() => expect(feed.recent()).toEqual([chat]), { timeout: 3000 });
    feed.stop();
  });
});

describe("wait_for_event", () => {
  it("closes the socket and rejects with Cancelled when the signal aborts", async () => {
    greet(api, ["player.chat"]);
    const controller = new AbortController();
    const waiting = waitForEvent(
      { url: api.url, token: TOKEN },
      { types: ["player.chat"], timeoutMs: 10_000 },
      controller.signal,
    );
    await vi.waitFor(() => expect(api.sockets[0]?.received.some((message) => message.op === "subscribe")).toBe(true));
    controller.abort();
    await expect(waiting).rejects.toThrow("Cancelled");
  });

  it("rejects at once with a signal already aborted", async () => {
    await expect(
      waitForEvent({ url: api.url, token: TOKEN }, { types: ["player.chat"], timeoutMs: 1000 }, AbortSignal.abort()),
    ).rejects.toThrow("Cancelled");
    expect(api.sockets).toHaveLength(0);
  });
});

describe("the event feed of a local world", () => {
  it("opens no socket and sends no token while no world is open, then connects to the one opened", async () => {
    const config = configFromEnv({ WORLDAPI_LOCAL_DIR: folder, WORLDAPI_TOKEN: "server-token" });
    expect(config.token).toBeUndefined();
    greet(api, ["player.chat"], [chat]);
    const feed = new EventFeed(config);
    feed.start();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(api.sockets).toHaveLength(0);
    announce("1", api.url, "world-token");
    await vi.waitFor(() => expect(feed.recent()).toEqual([chat]), { timeout: 5000 });
    expect(api.sockets[0]?.received[0]).toEqual({ op: "auth", token: "world-token" });
    feed.stop();
  });

  it("forgets the previous world's events and console lines when another world opens", async () => {
    const line = { type: "server.console", at: "2026-10-13T12:00:00Z", data: { message: "Done" } };
    greet(api, ["player.chat", "server.console"], [chat, line]);
    const next = { ...chat, data: { message: "new world" } };
    greet(other, ["player.chat"], [next]);
    announce("1", api.url, "first");
    const feed = new EventFeed(configFromEnv({ WORLDAPI_LOCAL_DIR: folder }));
    feed.start();
    await vi.waitFor(() => expect(feed.consoleLines()).toEqual([line]), { timeout: 3000 });
    expect(feed.recent()).toEqual([chat]);
    unlinkSync(join(folder, "1.json"));
    announce("2", other.url, "second");
    for (const socket of api.sockets) socket.close();
    await vi.waitFor(() => expect(feed.recent()).toEqual([next]), { timeout: 5000 });
    expect(feed.consoleLines()).toEqual([]);
    expect(other.sockets[0]?.received[0]).toEqual({ op: "auth", token: "second" });
    feed.stop();
  });
});
