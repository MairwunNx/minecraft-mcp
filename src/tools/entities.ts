import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import { cursor, format, ITEM_DETAIL, int, limit, location, segment, world } from "./common.js";

const center = {
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
  radius: z.number().positive().optional().describe("Blocks around x, y, z"),
};

export function entityTools(ctx: Context): void {
  const { api } = ctx;
  const one = (args: { world: string; uuid: string }) => ({ params: { path: { world: args.world, uuid: args.uuid } } });

  tool(ctx, {
    name: "get_entity_summary",
    untrusted: true,
    title: "Entity counts",
    description:
      "A compact look at a world's loaded entities, or those within radius of x, y, z: totals, counts by type, items on the ground, villagers, named mobs, tamed pets, and the ten busiest chunks with block entities and hoppers. Call it before list_entities.",
    scope: "server:read",
    effect: "read",
    input: {
      world,
      types: z.array(z.string()).optional().describe('Such as ["minecraft:item"]'),
      ...center,
    },
    run: (args) =>
      unwrap(
        api.GET("/worlds/{world}/entities/summary", {
          params: {
            path: { world: args.world },
            query: { type: args.types?.join(","), x: args.x, y: args.y, z: args.z, radius: args.radius },
          },
        }),
        ctx.token,
      ),
  });

  tool(ctx, {
    name: "list_entities",
    untrusted: true,
    title: "Entities",
    description: `Loaded entities, 25 a page, by type, name, chunk, or radius around x, y, z (nearest first). With uuid, one in detail: health, equipment, effects, owner, tags, spawn reason, a villager's trades, a dropped item's stack. ${ITEM_DETAIL}`,
    scope: "server:read",
    effect: "read",
    input: {
      world,
      uuid: segment.optional().describe("One entity in detail"),
      types: z.array(z.string()).optional().describe('Such as ["minecraft:zombie"]'),
      ...center,
      name: z.string().min(1).optional().describe("Part of a custom or player name"),
      chunk: z.object({ x: int(), z: int() }).optional().describe("Chunk coordinates: block ÷ 16, rounded down"),
      limit,
      cursor,
    },
    run: (args) =>
      args.uuid
        ? unwrap(api.GET("/worlds/{world}/entities/{uuid}", one({ world: args.world, uuid: args.uuid })), ctx.token)
        : unwrap(
            api.GET("/worlds/{world}/entities", {
              params: {
                path: { world: args.world },
                query: {
                  type: args.types?.join(","),
                  x: args.x,
                  y: args.y,
                  z: args.z,
                  radius: args.radius,
                  name: args.name,
                  chunk: args.chunk && `${args.chunk.x},${args.chunk.z}`,
                  limit: args.limit,
                  cursor: args.cursor,
                },
              },
            }),
            ctx.token,
          ),
  });

  tool(ctx, {
    name: "spawn_entity",
    title: "Spawn entities",
    description: "Spawn entities of a type, such as `minecraft:cow`, at a location.",
    scope: "world:write",
    effect: "write",
    untrusted: true,
    input: {
      world,
      type: z.string().min(1),
      location,
      count: z.number().int().min(1).max(1000).default(1).describe("The server caps it, 50 by default"),
      customName: z.string().optional(),
      format,
      ai: z.boolean().optional(),
      persistent: z.boolean().optional().describe("Never despawns"),
      glowing: z.boolean().optional(),
    },
    run: ({ world: name, ...body }) =>
      unwrap(api.POST("/worlds/{world}/entities", { params: { path: { world: name } }, body }), ctx.token),
  });

  tool(ctx, {
    name: "update_entity",
    title: "Change an entity",
    description:
      "Rename, toggle AI, glowing, gravity, or invulnerability, set health (0 kills) or fire, teleport, push, or tag an entity. Not for players.",
    scope: "world:write",
    effect: "destructive",
    untrusted: true,
    input: {
      world,
      uuid: segment,
      customName: z.string().optional(),
      format,
      customNameVisible: z.boolean().optional(),
      glowing: z.boolean().optional(),
      silent: z.boolean().optional(),
      invulnerable: z.boolean().optional(),
      gravity: z.boolean().optional(),
      persistent: z.boolean().optional(),
      ai: z.boolean().optional(),
      health: z.number().min(0).optional().describe("2 per heart"),
      fireTicks: z.number().int().min(0).max(1_000_000).optional().describe("20 a second"),
      location: location.optional().describe("Teleport here"),
      velocity: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional().describe("Blocks per tick"),
      addTags: z.array(z.string()).optional(),
      removeTags: z.array(z.string()).optional(),
    },
    run: ({ world: name, uuid, ...body }) =>
      unwrap(
        api.PATCH("/worlds/{world}/entities/{uuid}", {
          params: { path: { world: name, uuid } },
          body: { ...body, addTags: body.addTags ?? [], removeTags: body.removeTags ?? [] },
        }),
        ctx.token,
      ),
  });

  tool(ctx, {
    name: "remove_entity",
    title: "Remove entities",
    description:
      "Remove entities without drops: one by uuid, or many by types (dropped items, arrows, a farm's overflow), optionally within radius of x, y, z, nearest first up to max (1000 by default). Many at once never touches players and skips named mobs and tamed pets unless includeNamed. Try dryRun first and tell the user what would go.",
    scope: "world:write",
    effect: "destructive",
    input: {
      world,
      uuid: segment.optional(),
      types: z.array(z.string().min(1)).optional().describe('Such as ["minecraft:item"]'),
      ...center,
      max: z.number().int().min(1).max(100_000).optional(),
      includeNamed: z.boolean().optional(),
      dryRun: z.boolean().optional().describe("Only count"),
    },
    run: (args) => {
      if (args.uuid)
        return unwrap(
          api.DELETE("/worlds/{world}/entities/{uuid}", one({ world: args.world, uuid: args.uuid })),
          ctx.token,
        );
      if (!args.types?.length) throw new Error("Give uuid, or types for many at once");
      return unwrap(
        api.DELETE("/worlds/{world}/entities", {
          params: {
            path: { world: args.world },
            query: {
              type: args.types.join(","),
              x: args.x,
              y: args.y,
              z: args.z,
              radius: args.radius,
              max: args.max,
              includeNamed: args.includeNamed,
              dryRun: args.dryRun,
            },
          },
        }),
        ctx.token,
      );
    },
  });

  tool(ctx, {
    name: "world_effect",
    title: "Lightning, explosions, sounds, particles",
    description:
      "At a location: `lightning` (effectOnly is harmless), an `explosion` (power 4 is TNT), a `sound` such as `minecraft:entity.ender_dragon.growl` for everyone nearby, or `particles` such as `minecraft:heart` (not ones that need extra data, like dust).",
    scope: "world:write",
    effect: "destructive",
    input: {
      world,
      kind: z.enum(["lightning", "explosion", "sound", "particles"]),
      location,
      effectOnly: z.boolean().optional(),
      power: z.number().min(0).optional().describe("4 by default"),
      fire: z.boolean().optional(),
      breakBlocks: z.boolean().optional(),
      sound: z.string().optional().describe("The sound key"),
      volume: z.number().min(0).max(16).optional(),
      pitch: z.number().min(0.5).max(2).optional(),
      category: z.string().optional().describe("`master` by default"),
      particle: z.string().optional().describe("The particle key"),
      count: z.number().int().min(1).max(10_000).optional().describe("10 by default"),
      offset: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional().describe("Spread"),
      speed: z.number().min(0).optional(),
    },
    run: (args) => {
      const params = { params: { path: { world: args.world } } };
      const location = args.location;
      switch (args.kind) {
        case "lightning":
          return unwrap(
            api.POST("/worlds/{world}/lightning", {
              ...params,
              body: { location, effectOnly: args.effectOnly ?? false },
            }),
            ctx.token,
          );
        case "explosion":
          return unwrap(
            api.POST("/worlds/{world}/explosions", {
              ...params,
              body: {
                location,
                power: args.power ?? 4,
                fire: args.fire ?? false,
                breakBlocks: args.breakBlocks ?? false,
              },
            }),
            ctx.token,
          );
        case "sound":
          if (!args.sound) throw new Error("kind sound needs sound");
          return unwrap(
            api.POST("/worlds/{world}/sounds", {
              ...params,
              body: {
                sound: args.sound,
                location,
                volume: args.volume ?? 1,
                pitch: args.pitch ?? 1,
                category: args.category ?? "master",
              },
            }),
            ctx.token,
          );
        case "particles":
          if (!args.particle) throw new Error("kind particles needs particle");
          return unwrap(
            api.POST("/worlds/{world}/particles", {
              ...params,
              body: {
                particle: args.particle,
                location,
                count: args.count ?? 10,
                offset: args.offset,
                speed: args.speed ?? 0,
              },
            }),
            ctx.token,
          );
      }
    },
  });
}
