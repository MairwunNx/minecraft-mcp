import { z } from "zod";

export const world = z
  .string()
  .default("world")
  .describe("World name, such as `world`, `world_nether`, `world_the_end`, or a key like `minecraft:the_nether`");

export const player = z.string().min(1).describe("Player name or UUID");

/** A player argument that falls back to the user's own player (WORLDAPI_PLAYER) when one is set. */
export function playerOrMe(me: string | undefined) {
  return me ? player.default(me).describe(`Player name or UUID; ${me}, the user, when left out`) : player;
}

export const location = z
  .object({
    world: z.string().describe("World name"),
    x: z.number(),
    y: z.number(),
    z: z.number(),
    yaw: z.number().optional(),
    pitch: z.number().optional(),
  })
  .describe("A spot in a world; y is height (the overworld runs from -64 to 319)");

export const blockPosition = z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() });

export const format = z
  .enum(["plain", "minimessage"])
  .default("plain")
  .describe("`minimessage` reads tags like `<green>Hi` or `<bold>`; `plain` sends the text as is");

export const limit = z.number().int().min(1).max(500).optional().describe("How many items to return");
export const cursor = z.string().optional().describe("`nextCursor` from the previous page");

export const item = z
  .object({
    type: z.string().optional().describe("Item key, such as `minecraft:diamond_sword`"),
    item: z
      .string()
      .optional()
      .describe("Full item in command syntax, such as `minecraft:diamond_sword[enchantments={sharpness:5}]`"),
    amount: z.number().int().min(1).max(6400).default(1),
    name: z.string().optional().describe("Custom name"),
    lore: z.array(z.string()).optional(),
    enchantments: z
      .record(z.string(), z.number().int().min(1).max(255))
      .optional()
      .describe("Enchantment key to level"),
    damage: z.number().int().optional(),
    unbreakable: z.boolean().optional(),
    format: format.optional(),
  })
  .describe("Give `type` (plus optional extras) or a full `item` string");

export const SLOT_LAYOUT =
  "Inventory slots: 0–8 hotbar, 9–35 main, 36 boots, 37 leggings, 38 chestplate, 39 helmet, 40 offhand. Ender chest slots: 0–26.";

export const OFFLINE_NOTE = "The player must be online; otherwise the error is `player_offline`.";
