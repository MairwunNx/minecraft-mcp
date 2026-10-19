import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import { player, world } from "./common.js";

export function worldTools(ctx: Context): void {
  const { api, token } = ctx;
  const path = (name: string) => ({ params: { path: { world: name } } });

  tool(ctx, {
    name: "list_worlds",
    title: "Worlds",
    description: "Loaded worlds with their dimension key and player count.",
    scope: "server:read",
    effect: "read",
    input: {},
    run: () => unwrap(api.GET("/worlds"), token),
  });

  tool(ctx, {
    name: "get_world",
    title: "World",
    description:
      "Time of day (dayTime 0–23999: 0 sunrise, 6000 noon, 13000 night, 18000 midnight), day number, moon phase, ticks until night, whether beds work, weather, difficulty, PvP, spawn, the world border, game rule values, and load. ruleDetails adds each game rule's type and default; size adds chunks ever generated, explored area in km², and size on disk.",
    scope: "server:read",
    effect: "read",
    input: {
      world,
      ruleDetails: z.boolean().optional().describe("Add every game rule with its type and default"),
      size: z.boolean().optional().describe("Add explored area and size on disk"),
    },
    run: async (args) => {
      const [view, gameRuleDetails, size] = await Promise.all([
        unwrap(api.GET("/worlds/{world}", path(args.world)), token),
        args.ruleDetails ? unwrap(api.GET("/worlds/{world}/gamerules", path(args.world)), token) : undefined,
        args.size ? unwrap(api.GET("/worlds/{world}/stats", path(args.world)), token) : undefined,
      ]);
      return { ...view, ...(gameRuleDetails && { gameRuleDetails }), ...(size && { size }) };
    },
  });

  tool(ctx, {
    name: "locate",
    title: "Find blocks, biomes, or structures",
    description:
      "The nearest blocks, biomes, or structures of some kinds, nearest first. `block` takes keys or tags (`minecraft:diamond_ore`, `#minecraft:logs`, `#minecraft:iron_ores`) and reads only loaded chunks (those near players), 32 blocks around by default; `unloadedChunks` says how many in range it skipped. `biome` asks the world generator, so it reaches unexplored land, 1024 blocks around by default. `structure` takes keys such as `stronghold`, `ancient_city`, `trial_chambers`, or a prefix such as `village` that matches every village kind; radius is in chunks, and unexplored keeps only ones nobody found yet. Without x and z it searches around the player (the user's own when WORLDAPI_PLAYER is set), or, for biomes and structures, from the world spawn. Coordinates are private: it needs players:private, or anonymous access the server allows. Structure search blocks the server thread for a moment, so keep the radius modest.",
    scope: "server:read",
    effect: "read",
    input: {
      kind: z.enum(["block", "biome", "structure"]),
      targets: z
        .array(z.string().min(1))
        .min(1)
        .describe('Such as ["minecraft:diamond_ore", "#minecraft:logs"], ["minecraft:cherry_grove"], or ["village"]'),
      world: z.string().optional().describe("World name; the player's world, or `world`, when left out"),
      x: z.number().int().optional(),
      y: z.number().int().optional().describe("Needed for blocks when x and z are given"),
      z: z.number().int().optional(),
      player: player.optional().describe("Search around this player instead of x, y, z"),
      radius: z.number().int().min(1).optional().describe("Blocks for blocks and biomes, chunks for structures"),
      unexplored: z.boolean().optional().describe("Structures only: only ones nobody has found yet"),
      limit: z.number().int().min(1).max(100).optional().describe("Results to return, nearest first; 10 by default"),
    },
    run: async (args) => {
      let { world: name, x, y, z } = args;
      const who = args.player ?? ctx.player;
      if ((x === undefined || z === undefined) && who) {
        const view = await unwrap(api.GET("/players/{player}", { params: { path: { player: who } } }), token);
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
        token,
      );
    },
  });

  tool(ctx, {
    name: "set_world",
    title: "Change a world",
    description:
      "Change any of these at once; only what you give changes. The time of day (dayTime 0–23999: 0 sunrise, 1000 morning, 6000 noon, 13000 night, 18000 midnight), or move the clock forward with addTicks (24000 is a day). The weather (clear, rain, thunder), optionally for durationTicks (20 per second). The difficulty, PvP, and the world spawn.",
    scope: "world:write",
    effect: "write",
    input: {
      world,
      dayTime: z.number().int().min(0).max(23999).optional(),
      addTicks: z.number().int().optional().describe("Moves the clock forward; 24000 ticks are one day"),
      weather: z.enum(["clear", "rain", "thunder"]).optional(),
      durationTicks: z.number().int().positive().optional().describe("How long the new weather lasts"),
      difficulty: z.enum(["peaceful", "easy", "normal", "hard"]).optional(),
      pvp: z.boolean().optional().describe("Whether players can hurt each other"),
      spawn: z
        .object({ x: z.number().int(), y: z.number().int(), z: z.number().int(), angle: z.number().optional() })
        .optional()
        .describe("New world spawn point"),
    },
    run: (args) =>
      unwrap(
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
        token,
      ),
  });

  tool(ctx, {
    name: "set_gamerule",
    title: "Set game rules",
    description:
      'Set one or more game rules at once, such as { "keep_inventory": true, "players_sleeping_percentage": 50 }. get_world with ruleDetails lists the names and types.',
    scope: "world:write",
    effect: "idempotent",
    input: { world, rules: z.record(z.string(), z.union([z.boolean(), z.number().int()])) },
    run: (args) => unwrap(api.PATCH("/worlds/{world}/gamerules", { ...path(args.world), body: args.rules }), token),
  });

  tool(ctx, {
    name: "set_world_border",
    title: "Change the world border",
    description: "Resize (optionally over time) or move the world border, or change its damage and warnings.",
    scope: "world:write",
    effect: "idempotent",
    input: {
      world,
      size: z.number().positive().optional().describe("Width in blocks"),
      transitionSeconds: z.number().int().min(0).optional(),
      centerX: z.number().optional(),
      centerZ: z.number().optional(),
      damageAmount: z.number().min(0).optional(),
      damageBuffer: z.number().min(0).optional(),
      warningDistance: z.number().int().min(0).optional(),
      warningTimeTicks: z.number().int().min(0).optional(),
    },
    run: ({ world: name, ...body }) => unwrap(api.PATCH("/worlds/{world}/border", { ...path(name), body }), token),
  });
}
