import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import { blockPosition, cursor, limit, world } from "./common.js";

const xyz = { x: z.number().int(), y: z.number().int(), z: z.number().int() };

export function blockTools(ctx: Context): void {
  const { api, token } = ctx;
  const at = (args: { world: string; x: number; y: number; z: number }) => ({
    params: { path: { world: args.world, x: args.x, y: args.y, z: args.z } },
  });

  tool(ctx, {
    name: "get_block",
    title: "Block",
    description:
      "A block's type, full state, light, biome, redstone power, and contents of chests, signs, spawners, and similar. Chunks that were never generated give `chunk_not_generated`.",
    scope: "read",
    effect: "read",
    input: { world, ...xyz },
    run: (args) => unwrap(api.GET("/worlds/{world}/blocks/{x}/{y}/{z}", at(args)), token),
  });

  tool(ctx, {
    name: "get_biome",
    title: "Biome",
    description: "The biome at a block, with temperature and humidity.",
    scope: "read",
    effect: "read",
    input: { world, ...xyz },
    run: (args) => unwrap(api.GET("/worlds/{world}/biomes/{x}/{y}/{z}", at(args)), token),
  });

  tool(ctx, {
    name: "get_highest_block",
    title: "Surface height",
    description: "The highest block in a column; handy to find safe ground before teleporting.",
    scope: "read",
    effect: "read",
    input: {
      world,
      x: z.number().int(),
      z: z.number().int(),
      heightmap: z.enum(["motion_blocking", "motion_blocking_no_leaves", "ocean_floor", "world_surface"]).optional(),
    },
    run: (args) =>
      unwrap(
        api.GET("/worlds/{world}/highest/{x}/{z}", {
          params: { path: { world: args.world, x: args.x, z: args.z }, query: { heightmap: args.heightmap } },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "list_chunks",
    title: "Loaded chunks",
    description:
      "Loaded chunks with entity counts. A chunk is 16×16 blocks; chunk X is block X divided by 16, rounded down.",
    scope: "read",
    effect: "read",
    input: { world, limit, cursor },
    run: (args) =>
      unwrap(
        api.GET("/worlds/{world}/chunks", {
          params: { path: { world: args.world }, query: { limit: args.limit, cursor: args.cursor } },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "get_chunk",
    title: "Chunk",
    description:
      "One chunk: entities and block entities by type, how long players spent there, slime chunk, force-loaded.",
    scope: "read",
    effect: "read",
    input: { world, chunkX: z.number().int(), chunkZ: z.number().int() },
    run: (args) =>
      unwrap(
        api.GET("/worlds/{world}/chunks/{chunkX}/{chunkZ}", {
          params: { path: { world: args.world, chunkX: args.chunkX, chunkZ: args.chunkZ } },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "set_block",
    title: "Set a block",
    description:
      "Place one block. `block` is a key or full state: `stone`, `minecraft:oak_stairs[facing=east]`. physics updates neighbors (sand falls, water flows).",
    scope: "write:world",
    effect: "idempotent",
    input: { world, ...xyz, block: z.string().min(1), physics: z.boolean().default(false) },
    run: (args) =>
      unwrap(
        api.PUT("/worlds/{world}/blocks/{x}/{y}/{z}", {
          ...at(args),
          body: { block: args.block, physics: args.physics },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "fill_blocks",
    title: "Fill a box",
    description:
      "Fill the box between two corners (inclusive) with one block. Modes: `replace` sets everything, `keep` only fills air, `replace_type` only changes blocks of type `replace`. The server caps the volume (32768 blocks by default).",
    scope: "write:world",
    effect: "destructive",
    input: {
      world,
      from: blockPosition,
      to: blockPosition,
      block: z.string().min(1),
      mode: z.enum(["replace", "keep", "replace_type"]).default("replace"),
      replace: z.string().optional(),
      physics: z.boolean().default(false),
    },
    run: ({ world: name, ...body }) =>
      unwrap(api.POST("/worlds/{world}/blocks/fill", { params: { path: { world: name } }, body }), token),
  });

  tool(ctx, {
    name: "force_load_chunk",
    title: "Force-load a chunk",
    description: "Keep a chunk loaded even with nobody near, or release it.",
    scope: "write:world",
    effect: "idempotent",
    input: { world, chunkX: z.number().int(), chunkZ: z.number().int(), forceLoaded: z.boolean() },
    run: (args) =>
      unwrap(
        api.PATCH("/worlds/{world}/chunks/{chunkX}/{chunkZ}", {
          params: { path: { world: args.world, chunkX: args.chunkX, chunkZ: args.chunkZ } },
          body: { forceLoaded: args.forceLoaded },
        }),
        token,
      ),
  });
}
