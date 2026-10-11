import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import { world } from "./common.js";

export function worldTools(ctx: Context): void {
  const { api, token } = ctx;
  const path = (name: string) => ({ params: { path: { world: name } } });

  tool(ctx, {
    name: "list_worlds",
    title: "Worlds",
    description: "Loaded worlds with their dimension key and player count.",
    scope: "read",
    effect: "read",
    input: {},
    run: () => unwrap(api.GET("/worlds"), token),
  });

  tool(ctx, {
    name: "get_world",
    title: "World",
    description:
      "Time of day (dayTime 0–23999: 0 sunrise, 6000 noon, 13000 night, 18000 midnight), day number, moon phase, weather, difficulty, spawn, border, game rules, and load.",
    scope: "read",
    effect: "read",
    input: { world },
    run: (args) => unwrap(api.GET("/worlds/{world}", path(args.world)), token),
  });

  tool(ctx, {
    name: "get_gamerules",
    title: "Game rules",
    description: "Every game rule with its type, value, and default. Names are snake_case, such as `keep_inventory`.",
    scope: "read",
    effect: "read",
    input: { world },
    run: (args) => unwrap(api.GET("/worlds/{world}/gamerules", path(args.world)), token),
  });

  tool(ctx, {
    name: "get_world_border",
    title: "World border",
    description: "Border size, center, damage, and warning settings.",
    scope: "read",
    effect: "read",
    input: { world },
    run: (args) => unwrap(api.GET("/worlds/{world}/border", path(args.world)), token),
  });

  tool(ctx, {
    name: "get_world_stats",
    title: "World size",
    description: "Chunks ever generated, explored area in km², region files, and size on disk.",
    scope: "read",
    effect: "read",
    input: { world },
    run: (args) => unwrap(api.GET("/worlds/{world}/stats", path(args.world)), token),
  });

  tool(ctx, {
    name: "locate_structure",
    title: "Find a structure",
    description:
      "The nearest structure of a type, from a point or the world spawn. `type` is a key such as `stronghold`, `ancient_city`, `trial_chambers`, or a prefix such as `village` that matches every village kind. Searching blocks the server thread for a moment, so keep the radius modest.",
    scope: "read",
    effect: "read",
    input: {
      world,
      type: z.string().min(1),
      x: z.number().int().optional(),
      z: z.number().int().optional(),
      radius: z.number().int().min(1).optional().describe("Search radius in chunks"),
      unexplored: z.boolean().optional().describe("Only structures nobody found yet"),
    },
    run: (args) =>
      unwrap(
        api.GET("/worlds/{world}/structures/nearest", {
          params: {
            path: { world: args.world },
            query: { type: args.type, x: args.x, z: args.z, radius: args.radius, unexplored: args.unexplored },
          },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "set_time",
    title: "Set the time",
    description:
      "Set the time of day (dayTime 0–23999: 0 sunrise, 1000 morning, 6000 noon, 13000 night, 18000 midnight), or move the clock forward with addTicks.",
    scope: "write:world",
    effect: "write",
    input: {
      world,
      dayTime: z.number().int().min(0).max(23999).optional(),
      addTicks: z.number().int().optional().describe("24000 ticks are one day"),
    },
    run: (args) =>
      unwrap(
        api.PATCH("/worlds/{world}", { ...path(args.world), body: { dayTime: args.dayTime, addTime: args.addTicks } }),
        token,
      ),
  });

  tool(ctx, {
    name: "set_weather",
    title: "Set the weather",
    description: "Clear, rain, or thunder, optionally for a number of ticks (20 per second).",
    scope: "write:world",
    effect: "idempotent",
    input: {
      world,
      weather: z.enum(["clear", "rain", "thunder"]),
      durationTicks: z.number().int().positive().optional(),
    },
    run: (args) =>
      unwrap(
        api.PATCH("/worlds/{world}", {
          ...path(args.world),
          body: {
            weather: args.weather,
            weatherDurationTicks: args.weather === "clear" ? undefined : args.durationTicks,
            clearWeatherDurationTicks: args.weather === "clear" ? args.durationTicks : undefined,
          },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "set_difficulty",
    title: "Set the difficulty",
    description: "Set a world's difficulty.",
    scope: "write:world",
    effect: "idempotent",
    input: { world, difficulty: z.enum(["peaceful", "easy", "normal", "hard"]) },
    run: (args) =>
      unwrap(api.PATCH("/worlds/{world}", { ...path(args.world), body: { difficulty: args.difficulty } }), token),
  });

  tool(ctx, {
    name: "set_pvp",
    title: "Turn PvP on or off",
    description: "Whether players can hurt each other in a world.",
    scope: "write:world",
    effect: "idempotent",
    input: { world, pvp: z.boolean() },
    run: (args) => unwrap(api.PATCH("/worlds/{world}", { ...path(args.world), body: { pvp: args.pvp } }), token),
  });

  tool(ctx, {
    name: "set_world_spawn",
    title: "Set the world spawn",
    description: "Move the world spawn point.",
    scope: "write:world",
    effect: "idempotent",
    input: { world, x: z.number().int(), y: z.number().int(), z: z.number().int(), angle: z.number().optional() },
    run: (args) =>
      unwrap(
        api.PATCH("/worlds/{world}", {
          ...path(args.world),
          body: { spawn: { x: args.x, y: args.y, z: args.z, angle: args.angle ?? 0 } },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "set_gamerule",
    title: "Set game rules",
    description:
      'Set one or more game rules at once, such as { "keep_inventory": true, "players_sleeping_percentage": 50 }. Use get_gamerules for names and types.',
    scope: "write:world",
    effect: "idempotent",
    input: { world, rules: z.record(z.string(), z.union([z.boolean(), z.number().int()])) },
    run: (args) => unwrap(api.PATCH("/worlds/{world}/gamerules", { ...path(args.world), body: args.rules }), token),
  });

  tool(ctx, {
    name: "set_world_border",
    title: "Change the world border",
    description: "Resize (optionally over time) or move the world border, or change its damage and warnings.",
    scope: "write:world",
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
