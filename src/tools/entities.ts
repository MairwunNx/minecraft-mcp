import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import { cursor, format, limit, location, world } from "./common.js";

export function entityTools(ctx: Context): void {
  const { api, token } = ctx;
  const one = (args: { world: string; uuid: string }) => ({ params: { path: { world: args.world, uuid: args.uuid } } });

  tool(ctx, {
    name: "list_entities",
    title: "Entities",
    description:
      "Loaded entities in a world, filtered by type and by a radius around x, y, z. Only loaded chunks count: entities far from players aren't listed.",
    scope: "read",
    effect: "read",
    input: {
      world,
      types: z.array(z.string()).optional().describe('Entity keys, such as ["minecraft:zombie"]'),
      x: z.number().optional(),
      y: z.number().optional(),
      z: z.number().optional(),
      radius: z.number().positive().optional().describe("Blocks around x, y, z; give all three with it"),
      limit,
      cursor,
    },
    run: (args) =>
      unwrap(
        api.GET("/worlds/{world}/entities", {
          params: {
            path: { world: args.world },
            query: {
              type: args.types?.join(","),
              x: args.x,
              y: args.y,
              z: args.z,
              radius: args.radius,
              limit: args.limit,
              cursor: args.cursor,
            },
          },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "get_entity",
    title: "Entity",
    description: "One entity in detail: position, health, equipment, effects, owner, tags.",
    scope: "read",
    effect: "read",
    input: { world, uuid: z.string() },
    run: (args) => unwrap(api.GET("/worlds/{world}/entities/{uuid}", one(args)), token),
  });

  tool(ctx, {
    name: "spawn_entity",
    title: "Spawn entities",
    description:
      "Spawn one or more entities of a type, such as `minecraft:cow`, at a location. The server caps the count (50 by default).",
    scope: "write:world",
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
    scope: "write:world",
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
    title: "Remove an entity",
    description: "Remove an entity from the world without drops. Players can't be removed.",
    scope: "write:world",
    effect: "destructive",
    input: { world, uuid: z.string() },
    run: (args) => unwrap(api.DELETE("/worlds/{world}/entities/{uuid}", one(args)), token),
  });

  tool(ctx, {
    name: "strike_lightning",
    title: "Strike lightning",
    description: "Strike lightning at a location; effectOnly makes it harmless.",
    scope: "write:world",
    effect: "write",
    input: { world, location, effectOnly: z.boolean().default(false) },
    run: ({ world: name, ...body }) =>
      unwrap(api.POST("/worlds/{world}/lightning", { params: { path: { world: name } }, body }), token),
  });

  tool(ctx, {
    name: "create_explosion",
    title: "Explode",
    description: "Make an explosion. TNT has power 4. breakBlocks destroys terrain; fire sets things alight.",
    scope: "write:world",
    effect: "destructive",
    input: {
      world,
      location,
      power: z.number().min(0).default(4),
      fire: z.boolean().default(false),
      breakBlocks: z.boolean().default(false),
    },
    run: ({ world: name, ...body }) =>
      unwrap(api.POST("/worlds/{world}/explosions", { params: { path: { world: name } }, body }), token),
  });

  tool(ctx, {
    name: "play_sound",
    title: "Play a sound",
    description: "Play a sound at a location for everyone nearby, such as `minecraft:entity.ender_dragon.growl`.",
    scope: "write:world",
    effect: "write",
    input: {
      world,
      sound: z.string().min(1),
      location,
      volume: z.number().min(0).max(16).default(1),
      pitch: z.number().min(0.5).max(2).default(1),
      category: z.string().default("master"),
    },
    run: ({ world: name, ...body }) =>
      unwrap(api.POST("/worlds/{world}/sounds", { params: { path: { world: name } }, body }), token),
  });

  tool(ctx, {
    name: "spawn_particles",
    title: "Show particles",
    description:
      "Show particles at a location, such as `minecraft:heart` or `minecraft:flame`. Particles that need extra data (dust, block) aren't supported.",
    scope: "write:world",
    effect: "write",
    input: {
      world,
      particle: z.string().min(1),
      location,
      count: z.number().int().min(1).default(10),
      offset: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
      speed: z.number().min(0).default(0),
    },
    run: ({ world: name, ...body }) =>
      unwrap(api.POST("/worlds/{world}/particles", { params: { path: { world: name } }, body }), token),
  });
}
