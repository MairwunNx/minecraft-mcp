import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import { cursor, format, ITEM_DETAIL, limit, location, world } from "./common.js";

export function entityTools(ctx: Context): void {
  const { api, token } = ctx;
  const one = (args: { world: string; uuid: string }) => ({ params: { path: { world: args.world, uuid: args.uuid } } });

  tool(ctx, {
    name: "get_entity_summary",
    untrusted: true,
    title: "Entity counts",
    description:
      "A compact look at a world's loaded entities, or those within radius of x, y, z: totals, counts by type, items on the ground, villagers, named mobs, tamed pets, and the ten busiest chunks with their block entities and hoppers. Call it before list_entities, which shows entities one by one.",
    scope: "server:read",
    effect: "read",
    input: {
      world,
      types: z.array(z.string()).optional().describe('Count only these entity keys, such as ["minecraft:item"]'),
      x: z.number().optional(),
      y: z.number().optional(),
      z: z.number().optional(),
      radius: z.number().positive().optional().describe("Blocks around x, y, z; give all three with it"),
    },
    run: (args) =>
      unwrap(
        api.GET("/worlds/{world}/entities/summary", {
          params: {
            path: { world: args.world },
            query: { type: args.types?.join(","), x: args.x, y: args.y, z: args.z, radius: args.radius },
          },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "list_entities",
    untrusted: true,
    title: "Entities",
    description: `Loaded entities in a world, 25 to a page, filtered by type, by a radius around x, y, z (nearest first), by name, or by chunk. Only loaded chunks count: entities far from players aren't listed. For a crowded world, get_entity_summary first; limit 0 only counts. With uuid, that one entity in detail: position, health, equipment, effects, owner, tags, leash holder, spawn reason, whether it despawns far from players or came from a spawner, a villager's profession, level, and trades, and a dropped item's stack, age, and pickup delay. ${ITEM_DETAIL}`,
    scope: "server:read",
    effect: "read",
    input: {
      world,
      uuid: z.string().optional().describe("One entity in detail; the other filters don't apply"),
      types: z.array(z.string()).optional().describe('Entity keys, such as ["minecraft:zombie"]'),
      x: z.number().optional(),
      y: z.number().optional(),
      z: z.number().optional(),
      radius: z.number().positive().optional().describe("Blocks around x, y, z; give all three with it"),
      name: z
        .string()
        .min(1)
        .optional()
        .describe("Only entities whose custom or player name contains this, ignoring case"),
      chunk: z
        .object({ x: z.number().int(), z: z.number().int() })
        .optional()
        .describe("Only this chunk, by chunk coordinates (block coordinate divided by 16, rounded down)"),
      limit,
      cursor,
    },
    run: (args) =>
      args.uuid
        ? unwrap(api.GET("/worlds/{world}/entities/{uuid}", one({ world: args.world, uuid: args.uuid })), token)
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
            token,
          ),
  });

  tool(ctx, {
    name: "spawn_entity",
    title: "Spawn entities",
    description:
      "Spawn one or more entities of a type, such as `minecraft:cow`, at a location. The server caps the count (50 by default).",
    scope: "world:write",
    effect: "write",
    input: {
      world,
      type: z.string().min(1),
      location,
      count: z.number().int().min(1).default(1),
      customName: z.string().optional(),
      format,
      ai: z.boolean().optional(),
      persistent: z.boolean().optional().describe("Don't despawn"),
      glowing: z.boolean().optional(),
    },
    run: ({ world: name, ...body }) =>
      unwrap(api.POST("/worlds/{world}/entities", { params: { path: { world: name } }, body }), token),
  });

  tool(ctx, {
    name: "update_entity",
    title: "Change an entity",
    description:
      "Rename, toggle AI, glowing, gravity, invulnerability, set health or fire, teleport, push, or tag an entity. Not for players.",
    scope: "world:write",
    effect: "write",
    input: {
      world,
      uuid: z.string(),
      customName: z.string().optional(),
      format,
      customNameVisible: z.boolean().optional(),
      glowing: z.boolean().optional(),
      silent: z.boolean().optional(),
      invulnerable: z.boolean().optional(),
      gravity: z.boolean().optional(),
      persistent: z.boolean().optional(),
      ai: z.boolean().optional(),
      health: z.number().min(0).optional(),
      fireTicks: z.number().int().optional(),
      location: location.optional().describe("Teleport here"),
      velocity: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
      addTags: z.array(z.string()).optional(),
      removeTags: z.array(z.string()).optional(),
    },
    run: ({ world: name, uuid, ...body }) =>
      unwrap(
        api.PATCH("/worlds/{world}/entities/{uuid}", {
          params: { path: { world: name, uuid } },
          body: { ...body, addTags: body.addTags ?? [], removeTags: body.removeTags ?? [] },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "remove_entity",
    title: "Remove entities",
    description:
      "Remove entities without drops: one by uuid, or many by types, such as dropped items, arrows, or a mob farm's overflow, optionally within a radius of x, y, z. Many at once never touches players, skips named mobs and tamed pets unless includeNamed is true, takes the nearest first up to max, and dryRun only counts. Try dryRun first and tell the user what would go.",
    scope: "world:write",
    effect: "destructive",
    input: {
      world,
      uuid: z.string().optional().describe("One entity"),
      types: z
        .array(z.string().min(1))
        .optional()
        .describe('Entity keys, such as ["minecraft:item", "minecraft:arrow"]'),
      x: z.number().optional(),
      y: z.number().optional(),
      z: z.number().optional(),
      radius: z.number().positive().optional().describe("Blocks around x, y, z"),
      max: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Remove at most this many; the server caps it (1000 by default)"),
      includeNamed: z.boolean().optional().describe("Also remove named mobs and tamed pets"),
      dryRun: z.boolean().optional().describe("Only count what would be removed"),
    },
    run: (args) => {
      if (args.uuid)
        return unwrap(
          api.DELETE("/worlds/{world}/entities/{uuid}", one({ world: args.world, uuid: args.uuid })),
          token,
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
        token,
      );
    },
  });

  tool(ctx, {
    name: "world_effect",
    title: "Lightning, explosions, sounds, particles",
    description:
      "Make something happen at a location. `lightning` strikes (effectOnly makes it harmless). `explosion` blows up with power (TNT is 4); breakBlocks destroys terrain and fire sets things alight. `sound` plays a sound such as `minecraft:entity.ender_dragon.growl` for everyone nearby. `particles` shows particles such as `minecraft:heart` or `minecraft:flame`; ones that need extra data (dust, block) aren't supported.",
    scope: "world:write",
    effect: "destructive",
    input: {
      world,
      kind: z.enum(["lightning", "explosion", "sound", "particles"]),
      location,
      effectOnly: z.boolean().optional().describe("lightning: only the flash and the sound"),
      power: z.number().min(0).optional().describe("explosion: 4 by default"),
      fire: z.boolean().optional().describe("explosion"),
      breakBlocks: z.boolean().optional().describe("explosion"),
      sound: z.string().optional().describe("sound: the sound key"),
      volume: z.number().min(0).max(16).optional().describe("sound"),
      pitch: z.number().min(0.5).max(2).optional().describe("sound"),
      category: z.string().optional().describe("sound: `master` by default"),
      particle: z.string().optional().describe("particles: the particle key"),
      count: z.number().int().min(1).optional().describe("particles: 10 by default"),
      offset: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional().describe("particles: spread"),
      speed: z.number().min(0).optional().describe("particles"),
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
            token,
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
            token,
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
            token,
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
            token,
          );
      }
    },
  });
}
