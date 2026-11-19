import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import { each, int, parts, player, segment, world } from "./common.js";

/** A bound for border times and distances, so the schema doesn't show 2⁵³: a year in seconds. */
const LONG = 31_536_000;

export function worldTools(ctx: Context): void {
  const { api } = ctx;
  const path = (name: string) => ({ params: { path: { world: name } } });

  tool(ctx, {
    name: "get_world",
    title: "Worlds",
    description:
      "One world: time (dayTime 0–23999), day, moon phase, whether beds work, weather, difficulty, PvP, its own spawn, border, game rules, and load. Without world, every loaded world with its key and player count. include adds `rules` (types and defaults), `size` (chunks generated, km² explored, disk), and `respawn` (the server's spawn point, where players join and respawn without a bed).",
    scope: "server:read",
    effect: "read",
    input: {
      world: segment.optional().describe("World name or key, such as `world`. Leave out to list them"),
      include: z.array(z.enum(["rules", "size", "respawn"])).optional(),
    },
    run: async (args) => {
      const parts = new Set(args.include);
      const respawn = parts.has("respawn") ? unwrap(api.GET("/spawn"), ctx.token) : undefined;
      if (args.world === undefined) {
        const worlds = await unwrap(api.GET("/worlds"), ctx.token);
        return respawn ? { worlds, respawn: await respawn } : worlds;
      }
      const [view, gameRuleDetails, size, spawn] = await Promise.all([
        unwrap(api.GET("/worlds/{world}", path(args.world)), ctx.token),
        parts.has("rules") ? unwrap(api.GET("/worlds/{world}/gamerules", path(args.world)), ctx.token) : undefined,
        parts.has("size") ? unwrap(api.GET("/worlds/{world}/stats", path(args.world)), ctx.token) : undefined,
        respawn,
      ]);
      return {
        ...view,
        ...(gameRuleDetails && { gameRuleDetails }),
        ...(size && { size }),
        ...(spawn && { respawn: spawn }),
      };
    },
  });

  tool(ctx, {
    name: "locate",
    title: "Find blocks, biomes, or structures",
    description:
      "Nearest blocks, biomes, or structures first. `block` takes keys or tags and reads loaded chunks, 32 blocks around by default (`unloadedChunks` counts skipped ones). `biome` reaches unexplored land, 1024 around by default. `structure` takes keys such as `stronghold` or a prefix such as `village`, radius in chunks: keep it modest, it blocks the server thread. Without x and z, it searches around the player, or the spawn for biomes and structures. Needs players:private, or anonymous access the server allows.",
    scope: "server:read",
    effect: "read",
    input: {
      kind: z.enum(["block", "biome", "structure"]).describe("What targets name"),
      targets: z
        .array(z.string().min(1))
        .min(1)
        .describe('Such as ["minecraft:diamond_ore"], ["minecraft:cherry_grove"], or ["village"]'),
      world: segment.optional().describe("The player's world, or `world`, when left out"),
      x: int().optional(),
      y: int().optional().describe("Needed for blocks"),
      z: int().optional(),
      player: player.optional().describe("Search around this player instead"),
      radius: z.number().int().min(1).max(100_000).optional(),
      unexplored: z.boolean().optional().describe("Structures nobody has found yet"),
      limit: z.number().int().min(1).max(100).optional().describe("10 by default"),
    },
    run: async (args) => {
      let { world: name, x, y, z } = args;
      const who = args.player ?? ctx.player;
      if ((x === undefined || z === undefined) && who) {
        const view = await unwrap(api.GET("/players/{player}", { params: { path: { player: who } } }), ctx.token);
        const at = "location" in view ? view.location : undefined;
        if (!at) throw new Error(`${who}'s location isn't known`);
        name ??= at.world;
        x = Math.floor(at.x);
        y = Math.floor(at.y);
        z = Math.floor(at.z);
      }
      if (args.kind === "block" && (x === undefined || y === undefined || z === undefined))
        throw new Error("Block search needs x, y, and z, or a player");
      return unwrap(
        api.GET("/worlds/{world}/locate", {
          params: {
            path: { world: name ?? "world" },
            query: {
              kind: args.kind,
              target: args.targets.join(","),
              x,
              y,
              z,
              radius: args.radius,
              unexplored: args.unexplored,
              limit: args.limit,
            },
          },
        }),
        ctx.token,
      );
    },
  });

  tool(ctx, {
    name: "set_world",
    title: "Change a world",
    description:
      "Change a world: only what you give changes. Time, weather for durationTicks (20 a second), difficulty, PvP, game `rules` such as { \"keep_inventory\": true }, the `border`, this world's own `spawn`, `respawn` (moves the server's spawn point, where players join and respawn without a bed, here), and `chunks` to force-load, so farms run with nobody near. Each part, and each chunk, is answered on its own, a failed one with its error.",
    scope: "world:write",
    effect: "write",
    input: {
      world,
      dayTime: z
        .number()
        .int()
        .min(0)
        .max(23999)
        .optional()
        .describe("0 sunrise, 6000 noon, 13000 night, 18000 midnight"),
      addTicks: int().optional().describe("Moves the clock"),
      weather: z.enum(["clear", "rain", "thunder"]).optional(),
      durationTicks: z.number().int().positive().max(24_000_000).optional(),
      difficulty: z.enum(["peaceful", "easy", "normal", "hard"]).optional(),
      pvp: z.boolean().optional(),
      rules: z.record(z.string(), z.union([z.boolean(), int()])).optional(),
      border: z
        .object({
          size: z.number().positive().optional().describe("Width in blocks"),
          transitionSeconds: z.number().int().min(0).max(LONG).optional().describe("Resize gradually"),
          centerX: z.number().optional(),
          centerZ: z.number().optional(),
          damageAmount: z.number().min(0).optional().describe("Per block past the buffer"),
          damageBuffer: z.number().min(0).optional().describe("Blocks past the border before damage"),
          warningDistance: z.number().int().min(0).max(LONG).optional(),
          warningTimeTicks: z.number().int().min(0).max(LONG).optional(),
        })
        .optional(),
      spawn: z.object({ x: int(), y: int(), z: int(), angle: z.number().optional() }).optional(),
      respawn: z
        .object({
          x: int().optional(),
          y: int().optional(),
          z: int().optional(),
          yaw: z.number().min(-180).max(180).optional().describe("0 faces south"),
          pitch: z.number().min(-90).max(90).optional(),
          respawnRadius: z.number().int().min(0).max(LONG).optional(),
        })
        .optional()
        .describe("x, y, z together, or none for this world's own spawn"),
      chunks: z
        .array(z.object({ x: int(), z: int(), forceLoaded: z.boolean().describe("false releases it") }))
        .min(1)
        .max(64)
        .optional()
        .describe("By chunk coordinates: block X ÷ 16, rounded down"),
    },
    run: async (args) => {
      const own =
        args.dayTime !== undefined ||
        args.addTicks !== undefined ||
        args.weather !== undefined ||
        args.difficulty !== undefined ||
        args.pvp !== undefined ||
        args.spawn !== undefined;
      const { rules, border, respawn, chunks } = args;
      const done = await parts({
        // The world answers whole, game rules included: keep what this call could change, so a write stays small.
        world:
          own &&
          (async () => {
            const view = await unwrap(
              api.PATCH("/worlds/{world}", {
                ...path(args.world),
                body: {
                  dayTime: args.dayTime,
                  addTime: args.addTicks,
                  weather: args.weather,
                  weatherDurationTicks: args.weather && args.weather !== "clear" ? args.durationTicks : undefined,
                  clearWeatherDurationTicks: args.weather === "clear" ? args.durationTicks : undefined,
                  difficulty: args.difficulty,
                  pvp: args.pvp,
                  spawn: args.spawn && { ...args.spawn, angle: args.spawn.angle ?? 0 },
                },
              }),
              ctx.token,
            );
            const { time, weather, difficulty, pvp, spawn } = view as Record<string, unknown>;
            return { time, weather, difficulty, pvp, spawn };
          }),
        rules:
          rules &&
          (async () => {
            const answer = await unwrap(
              api.PATCH("/worlds/{world}/gamerules", { ...path(args.world), body: rules }),
              ctx.token,
            );
            // WorldAPI answers every rule: the ones this call set are enough.
            return Array.isArray(answer)
              ? answer.filter((rule: { name?: string }) => rule.name !== undefined && rule.name in rules)
              : answer;
          }),
        border:
          border &&
          (() => unwrap(api.PATCH("/worlds/{world}/border", { ...path(args.world), body: border }), ctx.token)),
        respawn: respawn && (() => unwrap(api.PATCH("/spawn", { body: { world: args.world, ...respawn } }), ctx.token)),
        chunks:
          chunks &&
          (() =>
            each(
              chunks,
              ({ x, z }) => ({ x, z }),
              ({ x, z, forceLoaded }) =>
                unwrap(
                  api.PATCH("/worlds/{world}/chunks/{chunkX}/{chunkZ}", {
                    params: { path: { world: args.world, chunkX: x, chunkZ: z } },
                    body: { forceLoaded },
                  }),
                  ctx.token,
                ),
            )),
      });
      if (Object.keys(done).length === 0) throw new Error("Nothing to change");
      return done;
    },
  });
}
