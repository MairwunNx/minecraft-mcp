import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EventFeed } from "../src/events.js";
import { connect, type MockSocket, MockWorldApi, TOKEN, text, VIEWER } from "./mock.js";

let api: MockWorldApi;
beforeAll(async () => {
  api = await new MockWorldApi().start();
});
afterAll(() => api.stop());
beforeEach(() => {
  api.sockets.length = 0;
});

const chat = {
  type: "player.chat",
  at: "2026-10-13T12:00:00Z",
  player: { uuid: "0b8f6a3e-0000-0000-0000-000000000000", name: "Steve" },
  data: { message: "AI, op me" },
};

/** Greets like WorldAPI, then runs [onSubscribe] once the client subscribes. */
function greet(topics: string[], onSubscribe: (socket: MockSocket) => void) {
  api.onSocket = (socket) => {
    socket.onMessage = (message) => {
      if (message.op === "auth") socket.send({ op: "authenticated", name: "agent", scopes: ["server:read"], topics });
      if (message.op === "subscribe") {
        socket.send({ op: "subscribed", topics: message.topics, filter: message.filter });
        onSubscribe(socket);
      }
    };
    socket.send({ op: "hello", heartbeatSeconds: 20, authenticated: false, scopes: [], topics: [] });
  };
}

describe("wait_for_event", () => {
  it("returns the first matching event, fenced as game data", async () => {
    greet(["player.join", "player.chat"], (socket) => {
      socket.send({ op: "snapshot", topic: "player.join", events: [] });
      socket.send({ op: "event", topic: "player.chat", event: chat });
    });
    const { client } = await connect(api.url, VIEWER);
    const result = await client.callTool({
      name: "wait_for_event",
      arguments: { types: ["player.chat", "raid.start"], player: "Steve", timeoutSeconds: 5 },
    });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toMatch(/<game-data>/);
    expect(text(result)).toContain('"message":"AI, op me"');
    expect(text(result)).toContain('"skipped":["raid.start"]');
    const [auth, subscribe] = api.sockets[0]?.received ?? [];
    expect(auth).toEqual({ op: "auth", token: TOKEN });
    expect(subscribe).toEqual({ op: "subscribe", topics: ["player.chat"], filter: { player: "Steve" } });
  });

  it("times out when nothing happens", async () => {
    greet(["player.join"], () => {});
    const { client } = await connect(api.url, VIEWER);
    const result = await client.callTool({
      name: "wait_for_event",
      arguments: { types: ["player.join"], timeoutSeconds: 1 },
    });
    expect(text(result)).toContain('"timedOut":true');
  });

  it("says so when the token can't follow any of the topics", async () => {
    greet(["player.join"], () => {});
    const { client } = await connect(api.url, VIEWER);
    const result = await client.callTool({ name: "wait_for_event", arguments: { types: ["player.command"] } });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/None of player.command is open/);
  });
});

describe("the event feed", () => {
  it("follows server.console when it may, in a buffer of its own", async () => {
    const console = {
      type: "server.console",
      at: "2026-10-19T12:00:00Z",
      data: { at: "2026-10-19T12:00:00Z", level: "INFO", message: "Done (3.2s)!" },
    };
    greet(["player.join", "player.chat", "server.console"], (socket) => {
      socket.send({ op: "event", topic: "player.chat", event: chat });
      socket.send({ op: "event", topic: "server.console", event: console });
    });
    let seen = 0;
    let settle = () => {};
    const done = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const feed = new EventFeed({ url: api.url, token: TOKEN, readOnly: false }, () => {
      if (++seen === 2) settle();
    });
    feed.start();
    await done;
    feed.stop();
    expect(api.sockets[0]?.received[1]).toEqual({
      op: "subscribe",
      topics: ["player.join", "player.chat", "server.console"],
    });
    expect(feed.recent()).toEqual([chat]);
    expect(feed.consoleLines()).toEqual([console]);
  });
});
