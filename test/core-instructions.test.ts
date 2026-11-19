import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer, instructions } from "../src/server.js";
import { MockWorldApi, OWNER, TOKEN } from "./mock.js";

/** Snake-case words in instructions and prompts that aren't tools: worlds and error codes. */
const NOT_TOOLS = new Set([
  "world_nether",
  "world_the_end",
  "the_nether",
  "the_end",
  "no_world",
  "invalid_token",
  "missing_scope",
]);

let api: MockWorldApi;
beforeAll(async () => {
  api = await new MockWorldApi().start();
});
afterAll(() => api.stop());

describe("instructions and prompts", () => {
  it("name only tools that exist", async () => {
    const config = { url: api.url, token: TOKEN, readOnly: false, player: "Steve" };
    const built = buildServer(config, new Set(OWNER), undefined, undefined, { platform: "paper" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await built.server.connect(serverSide);
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientSide);
    const texts = [
      instructions(config, new Set(), { platform: "paper" }),
      instructions(config, new Set(), { local: true, side: "integrated" }),
    ];
    for (const prompt of (await client.listPrompts()).prompts) {
      const args = Object.fromEntries((prompt.arguments ?? []).map((arg) => [arg.name, "x"]));
      for (const message of (await client.getPrompt({ name: prompt.name, arguments: args })).messages)
        texts.push((message.content as { text: string }).text);
    }
    const named = new Set(texts.flatMap((text) => text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []));
    const missing = [...named].filter((name) => !NOT_TOOLS.has(name) && !built.tools.includes(name));
    expect(missing).toEqual([]);
    for (const gone of ["get_audit_log", "force_load_chunk"]) expect(named).not.toContain(gone);
  });
});
