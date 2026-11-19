import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ResourceListChangedNotificationSchema,
  ToolListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Config, configFromEnv } from "../src/config.js";
import { ANONYMOUS, Permissions, type Scope } from "../src/scopes.js";
import { buildServer } from "../src/server.js";
import { ADMIN, MockWorldApi, OWNER, TOKEN, VIEWER } from "./mock.js";

let api: MockWorldApi;
/** What the mock's hello grants the token now. A test changes it as WorldAPI's panel would. */
let granted: Scope[] = [];
/** Set to reject the token instead. */
let reject = false;

beforeAll(async () => {
  api = await new MockWorldApi().start();
  api.onSocket = (socket) => {
    socket.onMessage = (message) => {
      if (message.op !== "auth") return;
      if (reject) socket.send({ op: "error", error: { code: "invalid_token", message: "unknown token" } });
      else socket.send({ op: "authenticated", name: "agent", scopes: granted, topics: [] });
    };
    socket.send({ op: "hello", heartbeatSeconds: 20, authenticated: false, scopes: [], topics: [] });
  };
});
afterAll(() => api.stop());
beforeEach(() => {
  reject = false;
  api.reply = () => ({ status: 200, body: { ok: true } });
});

async function session(start: Scope[], options: Partial<Config> = {}, gapMs?: number) {
  const config: Config = { url: api.url, token: TOKEN, readOnly: false, ...options };
  const permissions = new Permissions(new Set(start), config, () => {}, gapMs);
  const built = buildServer(config, permissions);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await built.server.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  let toolChanges = 0;
  let resourceChanges = 0;
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
    toolChanges++;
  });
  client.setNotificationHandler(ResourceListChangedNotificationSchema, () => {
    resourceChanges++;
  });
  await client.connect(clientSide);
  const names = async () => (await client.listTools()).tools.map((tool) => tool.name);
  const changes = () => ({ tools: toolChanges, resources: resourceChanges });
  return { client, built, config, permissions, names, changes };
}

/** Lets in-memory notifications and socket frames arrive. */
const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe("permissions read again while running", () => {
  it("list a tool once the token gains its permission, and tell the client", async () => {
    const { names, built, permissions, changes } = await session(VIEWER);
    expect(await names()).not.toContain("set_world");
    granted = [...VIEWER, "world:write"];
    await permissions.refresh();
    await settle();
    expect(changes().tools).toBe(1);
    expect(await names()).toContain("set_world");
    expect(built.tools).toContain("set_world");
    expect([...permissions.scopes]).toContain("world:write");
  });

  it("drop a tool and a resource once the token loses their permission", async () => {
    const { client, names, built, permissions, changes } = await session(ADMIN);
    const uris = async () => (await client.listResources()).resources.map((resource) => resource.uri);
    expect(await names()).toContain("run_command");
    expect(await uris()).toContain("worldapi://server/console");
    granted = VIEWER;
    await permissions.refresh();
    await settle();
    expect(changes()).toEqual({ tools: 1, resources: 1 });
    expect(await names()).not.toContain("run_command");
    expect(await uris()).not.toContain("worldapi://server/console");
    expect(built.tools).not.toContain("run_command");
    const call = await client.callTool({ name: "run_command", arguments: { command: "op Steve" } }).catch((e) => e);
    expect(JSON.stringify(call)).toMatch(/disabled|not found/i);
  });

  it("keep the set when WorldAPI can't be reached, and drop to anonymous when it rejects the token", async () => {
    const { names, config, permissions, changes } = await session(ADMIN);
    const before = await names();
    (config as { url: string }).url = "http://127.0.0.1:1/api/v1";
    await permissions.refresh();
    await settle();
    expect([...permissions.scopes]).toEqual(ADMIN);
    expect(await names()).toEqual(before);
    expect(changes().tools).toBe(0);
    (config as { url: string }).url = api.url;
    reject = true;
    await permissions.refresh();
    expect([...permissions.scopes]).toEqual(ANONYMOUS);
  });

  it("refresh after a missing_scope answer, at most once per gap", async () => {
    granted = OWNER;
    api.reply = () => ({ status: 403, body: { error: { code: "missing_scope", message: "needs players:private" } } });
    const { client, permissions } = await session(OWNER, {}, 300);
    const sockets = api.sockets.length;
    await client.callTool({ name: "get_server_status", arguments: {} });
    await client.callTool({ name: "get_server_status", arguments: {} });
    await client.callTool({ name: "get_server_status", arguments: {} });
    await settle();
    expect(api.sockets.length - sockets).toBe(1);
    // The calls inside the gap make one more refresh at its end, not one each.
    await settle(400);
    expect(api.sockets.length - sockets).toBe(2);
    expect([...permissions.scopes]).toEqual(OWNER);
  });

  it("never list a write in read-only mode, whatever the token gains", async () => {
    const { client, permissions } = await session(VIEWER, { readOnly: true });
    granted = OWNER;
    await permissions.refresh();
    await settle();
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(19);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    for (const write of ["set_world", "run_command", "edit_file", "execute_java"])
      expect(tools.map((tool) => tool.name)).not.toContain(write);
  });

  it("stop following the store once the session closes", async () => {
    const { client, permissions } = await session(VIEWER);
    const listeners = () => (permissions as unknown as { listeners: Set<unknown> }).listeners.size;
    expect(listeners()).toBe(1);
    await client.close();
    await settle();
    expect(listeners()).toBe(0);
  });

  it("read them again when another singleplayer world opens", async () => {
    const folder = mkdtempSync(join(tmpdir(), "worldapi-refresh-"));
    try {
      const open = (token: string, startedAt: string) =>
        writeFileSync(
          join(folder, "8110.json"),
          JSON.stringify({
            url: api.url,
            token,
            world: "New World",
            platform: "fabric",
            version: "1",
            pid: process.pid,
            startedAt,
          }),
        );
      open("first-world-token", "2026-11-19T00:00:00Z");
      const config = configFromEnv({ WORLDAPI_LOCAL_DIR: folder });
      const permissions = new Permissions(new Set(VIEWER), config);
      granted = ADMIN;
      const sockets = api.sockets.length;
      permissions.checkWorld();
      await settle();
      // The same world as at the start: nothing to read.
      expect(api.sockets.length).toBe(sockets);
      open("second-world-token", "2026-11-19T00:05:00Z");
      permissions.checkWorld();
      await permissions.refresh();
      expect(api.sockets.length).toBeGreaterThan(sockets);
      expect([...permissions.scopes]).toEqual(ADMIN);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
