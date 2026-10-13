import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, MockWorldApi } from "./mock.js";

let api: MockWorldApi;
beforeAll(async () => {
  api = await new MockWorldApi().start();
});
afterAll(() => api.stop());

describe("tools follow the token's scopes", () => {
  it("read shows only reads", async () => {
    const { client } = await connect(api.url, ["read"]);
    const { tools } = await client.listTools();
    expect(tools.length).toBe(26);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    expect(tools.map((tool) => tool.name)).not.toContain("set_world");
  });

  it("write scopes add their own writes only", async () => {
    const world = (await connect(api.url, ["read", "write:world"])).tools;
    expect(world).toContain("fill_blocks");
    expect(world).not.toContain("teleport_player");
    const players = (await connect(api.url, ["read", "write:players"])).tools;
    expect(players).toContain("teleport_player");
    expect(players).not.toContain("fill_blocks");
  });

  it("admin includes everything but code", async () => {
    const { tools } = await connect(api.url, ["admin"]);
    expect(tools).toContain("run_command");
    expect(tools).toContain("fill_blocks");
    expect(tools).not.toContain("execute_java");
    const all = (await connect(api.url, ["admin", "code"])).tools;
    expect(all).toContain("execute_java");
    expect(all.length).toBe(58);
    expect(new Set(all).size).toBe(all.length);
  });

  it("read-only mode hides every write, whatever the scopes", async () => {
    const { client } = await connect(api.url, ["admin", "code"], { readOnly: true });
    const { tools } = await client.listTools();
    expect(tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["get_access", "list_java_scripts"]));
    expect(tools.map((tool) => tool.name)).not.toContain("execute_java");
  });

  it("annotations describe the effect", async () => {
    const { client } = await connect(api.url, ["admin", "code"]);
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]));
    expect(byName.get_world).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(byName.fill_blocks).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(byName.set_gamerule).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
    expect(byName.execute_java).toMatchObject({ destructiveHint: true });
    expect(byName.manage_bans).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(byName.get_access).toMatchObject({ readOnlyHint: true });
    expect(byName.restart_server).toMatchObject({ destructiveHint: true });
    expect(byName.get_server_log).toMatchObject({ readOnlyHint: true });
  });

  it("resources and prompts are there", async () => {
    const { client } = await connect(api.url, ["read"]);
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toEqual([
      "worldapi://server/status",
      "worldapi://players/online",
      "worldapi://openapi",
      "worldapi://events/recent",
    ]);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toEqual(["player_whereabouts", "server_health_check"]);
  });
});
