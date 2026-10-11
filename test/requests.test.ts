import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { configFromEnv, redact } from "../src/config.js";
import { discoverScopes } from "../src/scopes.js";
import { connect, MockWorldApi, TOKEN, text } from "./mock.js";

let api: MockWorldApi;
beforeAll(async () => {
  api = await new MockWorldApi().start();
});
afterAll(() => api.stop());
beforeEach(() => {
  api.seen.length = 0;
  api.reply = () => ({ status: 200, body: { ok: true } });
});

describe("requests reach WorldAPI in its shape", () => {
  it("sends the bearer token and typed bodies", async () => {
    const { client } = await connect(api.url, ["admin"]);
    await client.callTool({
      name: "set_gamerule",
      arguments: { rules: { keep_inventory: true, players_sleeping_percentage: 50 } },
    });
    expect(api.seen[0]).toEqual({
      method: "PATCH",
      url: "/api/v1/worlds/world/gamerules",
      authorization: `Bearer ${TOKEN}`,
      body: { keep_inventory: true, players_sleeping_percentage: 50 },
    });
  });

  it("builds query strings and paths", async () => {
    const { client } = await connect(api.url, ["admin"]);
    await client.callTool({
      name: "get_events",
      arguments: { types: ["player.death", "player.join"], player: "Steve", limit: 5 },
    });
    expect(api.seen[0]?.url).toBe("/api/v1/events?type=player.death%2Cplayer.join&player=Steve&limit=5");
    await client.callTool({
      name: "give_item",
      arguments: { player: "Steve", item: { type: "minecraft:bread", amount: 16 }, container: "enderchest" },
    });
    expect(api.seen[1]).toMatchObject({
      method: "POST",
      url: "/api/v1/players/Steve/enderchest/give",
      body: { item: { type: "minecraft:bread", amount: 16 } },
    });
    await client.callTool({
      name: "grant_advancement",
      arguments: { player: "Steve", key: "minecraft:story/mine_diamond" },
    });
    expect(api.seen[2]?.url).toBe("/api/v1/players/Steve/advancements/minecraft%3Astory%2Fmine_diamond");
    await client.callTool({
      name: "ban_player",
      arguments: { player: "Griefer", reason: "lava", durationSeconds: 3600 },
    });
    expect(api.seen[3]?.body).toEqual({
      ban: [{ player: "Griefer", reason: "lava", durationSeconds: 3600 }],
      pardon: [],
      banIps: [],
      pardonIps: [],
    });
  });

  it("turns a 204 into done", async () => {
    api.reply = () => ({ status: 204 });
    const { client } = await connect(api.url, ["admin"]);
    const result = await client.callTool({
      name: "remove_entity",
      arguments: { uuid: "0b8f6a3e-0000-0000-0000-000000000000" },
    });
    expect(text(result)).toBe('{"done":true}');
  });

  it("rejects bad input before calling WorldAPI", async () => {
    const { client } = await connect(api.url, ["admin"]);
    const result = await client.callTool({ name: "set_time", arguments: { dayTime: 99999 } });
    expect(result.isError).toBe(true);
    expect(api.seen).toHaveLength(0);
  });
});

describe("errors", () => {
  it("carry WorldAPI's code and message", async () => {
    api.reply = () => ({ status: 409, body: { error: { code: "player_offline", message: "Steve isn't online" } } });
    const { client } = await connect(api.url, ["admin"]);
    const result = await client.callTool({ name: "get_player_inventory", arguments: { player: "Steve" } });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe("player_offline: Steve isn't online");
  });

  it("explain an unreachable server", async () => {
    const { client } = await connect("http://127.0.0.1:1/api/v1", ["read"]);
    const result = await client.callTool({ name: "get_server_status", arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/^unreachable: /);
  });
});

describe("the token stays secret", () => {
  it("never appears in results, even when WorldAPI echoes it", async () => {
    api.reply = (seen) => ({
      status: 400,
      body: { error: { code: "invalid_request", message: `bad header ${seen.authorization}` } },
    });
    const { client } = await connect(api.url, ["read"]);
    const failed = await client.callTool({ name: "get_server_status", arguments: {} });
    expect(text(failed)).not.toContain(TOKEN);
    expect(text(failed)).toContain("[token]");
    api.reply = () => ({ status: 200, body: { motd: TOKEN } });
    const ok = await client.callTool({ name: "get_server_status", arguments: {} });
    expect(text(ok)).not.toContain(TOKEN);
  });

  it("never reaches the log when scope discovery fails", async () => {
    const lines: string[] = [];
    const scopes = await discoverScopes(
      { url: "http://127.0.0.1:1/api/v1", token: TOKEN, readOnly: false },
      (line) => lines.push(line),
      500,
    );
    expect([...scopes]).toEqual(["read"]);
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("is redacted everywhere it might slip in", () => {
    expect(redact(`a ${TOKEN} b ${TOKEN}`, TOKEN)).toBe("a [token] b [token]");
    expect(redact("nothing", undefined)).toBe("nothing");
  });
});

describe("configuration", () => {
  it("reads the environment", () => {
    expect(
      configFromEnv({ WORLDAPI_URL: "http://host:8100/api/v1/", WORLDAPI_TOKEN: " t ", WORLDAPI_READ_ONLY: "true" }),
    ).toEqual({
      url: "http://host:8100/api/v1",
      token: "t",
      readOnly: true,
    });
    expect(configFromEnv({ WORLDAPI_URL: "http://host" }).token).toBeUndefined();
    expect(() => configFromEnv({})).toThrow(/WORLDAPI_URL/);
    expect(() => configFromEnv({ WORLDAPI_URL: "ftp://host" })).toThrow(/http/);
  });

  it("logs nothing to stdout", async () => {
    const write = vi.spyOn(process.stdout, "write");
    await connect(api.url, ["read"]);
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });
});
