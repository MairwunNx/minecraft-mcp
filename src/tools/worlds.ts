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
      "Time of day (dayTime 0–23999: 0 sunrise, 6000 noon, 13000 night, 18000 midnight), day number, moon phase, ticks until night, whether beds work, weather, difficulty, PvP, spawn, the world border, game rule values, and load. ruleDetails adds each game rule's type and default; size adds chunks ever generated, explored area in km², and size on disk.",
    scope: "read",
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
    name: "set_world",
    title: "Change a world",
    description:
      "Change any of these at once; only what you give changes. The time of day (dayTime 0–23999: 0 sunrise, 1000 morning, 6000 noon, 13000 night, 18000 midnight), or move the clock forward with addTicks (24000 is a day). The weather (clear, rain, thunder), optionally for durationTicks (20 per second). The difficulty, PvP, and the world spawn.",
    scope: "write:world",
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
