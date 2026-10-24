import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN, connect, MockWorldApi, OWNER, VIEWER } from "./mock.js";

let api: MockWorldApi;
beforeAll(async () => {
  api = await new MockWorldApi().start();
});
afterAll(() => api.stop());

describe("tools follow the token's permissions", () => {
  it("a viewer sees only reads", async () => {
    const { client } = await connect(api.url, VIEWER);
    const { tools } = await client.listTools();
    expect(tools.length).toBe(17);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    expect(tools.map((tool) => tool.name)).not.toContain("set_world");
    expect(tools.map((tool) => tool.name)).toContain("get_events");
    expect(tools.map((tool) => tool.name)).not.toContain("search_commands");
    expect(tools.map((tool) => tool.name)).not.toContain("read_file");
  });

  it("write permissions add their own writes only", async () => {
    const world = (await connect(api.url, ["server:read", "world:write"])).tools;
    expect(world).toEqual(expect.arrayContaining(["set_blocks", "edit_items", "set_world"]));
    expect(world).not.toContain("teleport_player");
    const players = (await connect(api.url, ["players:read", "players:write"])).tools;
    expect(players).toEqual(expect.arrayContaining(["teleport_player", "send_message", "edit_items"]));
    expect(players).not.toContain("set_blocks");
    expect(players).not.toContain("manage_access");
    const moderator = (await connect(api.url, ["players:moderate"])).tools;
    expect(moderator).toEqual(["get_access", "manage_access"]);
  });

  it("commands are read with commands:read or server:console, run only with server:console", async () => {
    expect((await connect(api.url, ["commands:read"])).tools).toEqual(["search_commands"]);
    expect((await connect(api.url, ["server:console"])).tools).toEqual(["search_commands", "run_command"]);
    expect((await connect(api.url, ["chat:read"])).tools).toEqual([]);
  });

  it("file reads come with files:read or logs:read, writes only with files:write", async () => {
    const logs = (await connect(api.url, ["logs:read"])).tools;
    expect(logs).toEqual(["get_server_log", "list_files", "read_file"]);
    const files = (await connect(api.url, ["files:read"])).tools;
    expect(files).toEqual(["list_files", "read_file"]);
    const writer = (await connect(api.url, ["files:read", "files:write"])).tools;
    expect(writer).toEqual(["list_files", "read_file", "edit_file"]);
  });

  it("admin has everything but files:write and code; owner has all", async () => {
    const { tools } = await connect(api.url, ADMIN);
    expect(tools).toEqual(
      expect.arrayContaining([
        "run_command",
        "search_commands",
        "set_blocks",
        "read_file",
        "restart_server",
        "list_tokens",
      ]),
    );
    expect(tools).not.toContain("execute_java");
    expect(tools).not.toContain("edit_file");
    const all = (await connect(api.url, OWNER)).tools;
    expect(all).toEqual(expect.arrayContaining(["execute_java", "edit_file", "list_java_scripts"]));
    expect(all.length).toBe(46);
    expect(new Set(all).size).toBe(all.length);
  });

  it("read-only mode hides every write, whatever the permissions", async () => {
    const { client } = await connect(api.url, OWNER, { readOnly: true });
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    expect(names).toEqual(
      expect.arrayContaining(["get_access", "list_java_scripts", "read_file", "list_files", "get_audit_log"]),
    );
    for (const write of ["execute_java", "edit_file", "edit_items", "run_command", "restart_server", "manage_access"])
      expect(names).not.toContain(write);
  });

  it("annotations describe the effect", async () => {
    const { client } = await connect(api.url, OWNER);
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]));
    expect(byName.get_world).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(byName.set_blocks).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(byName.set_world).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(byName.search_commands).toMatchObject({ readOnlyHint: true });
    expect(byName.execute_java).toMatchObject({ destructiveHint: true });
    expect(byName.manage_access).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(byName.get_access).toMatchObject({ readOnlyHint: true });
    expect(byName.restart_server).toMatchObject({ destructiveHint: true });
    expect(byName.get_server_log).toMatchObject({ readOnlyHint: true });
    expect(byName.read_file).toMatchObject({ readOnlyHint: true });
    expect(byName.edit_file).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(byName.run_command).toMatchObject({ destructiveHint: true });
  });

  it("resources and prompts are there", async () => {
    const { client } = await connect(api.url, VIEWER);
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toEqual([
      "worldapi://server/status",
      "worldapi://players/online",
      "worldapi://openapi",
      "worldapi://events/recent",
    ]);
    const logs = await connect(api.url, ["logs:read"]);
    expect((await logs.client.listResources()).resources.map((resource) => resource.uri)).toContain(
      "worldapi://server/console",
    );
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toEqual([
      "player_whereabouts",
      "server_health_check",
      "investigate_lag",
      "new_player_guide",
      "investigate_grief",
    ]);
    const lag = await client.getPrompt({ name: "investigate_lag", arguments: {} });
    expect(JSON.stringify(lag.messages)).toContain("get_entity_summary");
  });

  it("prompts and instructions only name tools that exist", async () => {
    const { client, tools } = await connect(api.url, OWNER, { player: "Steve" });
    const texts = [client.getInstructions() ?? ""];
    for (const prompt of (await client.listPrompts()).prompts) {
      const result = await client.getPrompt({
        name: prompt.name,
        arguments: { player: "Steve", where: "world 0 64 0" },
      });
      texts.push(JSON.stringify(result.messages));
    }
    for (const tool of (await client.listTools()).tools) texts.push(tool.description ?? "");
    const named = new Set(
      texts
        .join(" ")
        .match(/\b(?:get|list|set|find|wait|remove|send|edit|manage|run|locate|read|write|stop|save)_[a-z_]+\b/g),
    );
    expect([...named].filter((name) => !tools.includes(name))).toEqual([]);
  });
});

describe("instructions", () => {
  it("say what the token can't do, so the agent asks for a better one", async () => {
    const { instructions } = await import("../src/server.js");
    const config = { url: "http://x/api/v1", readOnly: false } as Parameters<typeof instructions>[0];
    const viewer = instructions(config, new Set(VIEWER));
    expect(viewer).toContain("send chat messages");
    expect(viewer).toContain("admin or owner group");
    expect(instructions(config, new Set(OWNER))).not.toContain("This token can't");
    expect(instructions({ ...config, readOnly: true }, new Set(OWNER))).toContain("Read-only mode is on");
  });
});
