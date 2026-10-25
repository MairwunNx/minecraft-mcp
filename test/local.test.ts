import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configFromEnv } from "../src/config.js";
import { findLocalWorld, NO_WORLD } from "../src/local.js";
import { LOCAL } from "../src/scopes.js";
import { buildServer } from "../src/server.js";
import { MockWorldApi, text } from "./mock.js";

/** A singleplayer world as the WorldAPI mod announces it in the folder. */
function announce(folder: string, port: number, url: string, extra: Record<string, unknown> = {}) {
  const world = {
    url,
    token: `token-${port}`,
    world: "New World",
    platform: "fabric",
    version: "4.2.0",
    pid: process.pid,
    startedAt: new Date().toISOString(),
    ...extra,
  };
  writeFileSync(join(folder, `${port}.json`), JSON.stringify(world));
}

describe("a local singleplayer world", () => {
  let folder: string;
  let api: MockWorldApi;

  beforeEach(async () => {
    folder = mkdtempSync(join(tmpdir(), "worldapi-local-"));
    api = await new MockWorldApi().start();
  });

  afterEach(async () => {
    rmSync(folder, { recursive: true, force: true });
    await api.stop();
  });

  it("finds the newest open world and skips files a closed game left", () => {
    announce(folder, 8110, "http://127.0.0.1:8110/api/v1", { startedAt: "2026-10-25T10:00:00Z" });
    announce(folder, 8111, "http://127.0.0.1:8111/api/v1", { startedAt: "2026-10-25T11:00:00Z" });
    announce(folder, 8112, "http://127.0.0.1:8112/api/v1", { startedAt: "2026-10-25T12:00:00Z", pid: 2 ** 22 + 12345 });
    expect(findLocalWorld(folder)?.url).toBe("http://127.0.0.1:8111/api/v1");
  });

  async function connectLocal() {
    const config = configFromEnv({ WORLDAPI_LOCAL_DIR: folder });
    const built = buildServer(config, new Set(LOCAL), undefined, undefined, { local: true });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await built.server.connect(serverSide);
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientSide);
    return { client, tools: built.tools };
  }

  it("tells the agent to open a world while none is open", async () => {
    const { client } = await connectLocal();
    const result = await client.callTool({ name: "get_server_status", arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain(NO_WORLD);
  });

  it("calls the world opened later, with its own token, and leaves scripts out", async () => {
    const { client, tools } = await connectLocal();
    expect(tools).not.toContain("execute_java");
    api.reply = () => ({ status: 200, body: { name: "Fabric", platform: "fabric", side: "integrated" } });
    announce(folder, 8113, api.url);
    const result = await client.callTool({ name: "get_server_status", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(api.seen.some((seen) => seen.url.startsWith("/api/v1/server"))).toBe(true);
    expect(api.seen.every((seen) => seen.authorization === "Bearer token-8113")).toBe(true);
  });
});
