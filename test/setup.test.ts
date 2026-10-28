import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configFromEnv } from "../src/config.js";
import { diagnose } from "../src/setup.js";
import { layers } from "../src/tools/blocks.js";

describe("setup_help says what to fix", () => {
  it("no address and no open world: how to play alone, or point at a server", async () => {
    const folder = mkdtempSync(join(tmpdir(), "worldapi-local-"));
    const result = await diagnose(configFromEnv({ WORLDAPI_LOCAL_DIR: folder, HOME: folder }));
    expect(result.state).toBe("no_world");
    expect(result.steps.join(" ")).toContain("/worldapi mcp");
    expect(result.steps.join(" ")).toContain("modrinth.com/plugin/worldapi");
  });

  it("nothing answers: the server, the port, and where to get WorldAPI", async () => {
    const refused = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const result = await diagnose(
      configFromEnv({ WORLDAPI_URL: "http://127.0.0.1:1/api/v1", WORLDAPI_TOKEN: "secret-token-123" }),
      refused,
    );
    expect(result.state).toBe("unreachable");
    expect(result.steps.join(" ")).toContain("worldapi-neoforge.jar");
    expect(JSON.stringify(result)).not.toContain("secret-token-123");
  });

  it("something else answers: the base path is probably wrong", async () => {
    const html = (async () => new Response("<html>", { status: 404 })) as typeof fetch;
    const result = await diagnose(configFromEnv({ WORLDAPI_URL: "https://example.com" }), html);
    expect(result.state).toBe("not_worldapi");
    expect(result.steps[0]).toContain("/api/v1");
  });
});

describe("an area reads as maps", () => {
  it("air is a dot, and each height is rows of z with x along them", () => {
    const shown = layers({
      world: "world",
      from: { x: 0, y: 64, z: 0 },
      to: { x: 1, y: 65, z: 1 },
      sizeX: 2,
      sizeY: 2,
      sizeZ: 2,
      palette: [
        { state: "minecraft:air", count: 5 },
        { state: "minecraft:stone", count: 3 },
      ],
      blocks: [1, 1, 1, 0, 0, 0, 0, 0],
    }) as { maps: Record<string, string[]>; palette: { symbol: string }[] };
    expect(shown.maps).toEqual({ "y=64": ["##", "#."], "y=65": ["..", ".."] });
    expect(shown.palette.map((entry) => entry.symbol)).toEqual([".", "#"]);
  });
});
