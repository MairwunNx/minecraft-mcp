import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import {
  player as anyPlayer,
  cursor,
  format,
  item,
  limit,
  location,
  OFFLINE_NOTE,
  playerOrMe,
  SLOT_LAYOUT,
} from "./common.js";

const container = z.enum(["inventory", "enderchest"]).default("inventory");

export function playerTools(ctx: Context): void {
  const { api, token } = ctx;
  const who = (name: string) => ({ params: { path: { player: name } } });
  const player = playerOrMe(ctx.player);

  tool(ctx, {
    name: "list_players",
    title: "Players",
    description: "Everyone who has played here: online state, first and last seen, playtime in seconds.",
    scope: "read",
    effect: "read",
    input: {
      online: z.boolean().optional(),
      sort: z.enum(["name", "last_seen", "playtime"]).optional(),
      limit,
      cursor,
    },
    run: (args) => unwrap(api.GET("/players", { params: { query: args } }), token),
  });

  tool(ctx, {
    name: "list_online_players",
    untrusted: true,
    title: "Online players",
    description: "Who is playing now, with world, game mode, health, food, level, ping, idle time, and location.",
    scope: "read",
    effect: "read",
    input: {},
    run: () => unwrap(api.GET("/players/online"), token),
  });

  tool(ctx, {
    name: "get_player",
    untrusted: true,
    title: "Player",
    description:
      "A player's profile and, while online, full state: game mode, health, food, XP, location, flight, speed, ping, client. Offline players show their last location.",
    scope: "read",
    effect: "read",
    input: { player },
    run: (args) => unwrap(api.GET("/players/{player}", who(args.player)), token),
  });

  tool(ctx, {
    name: "get_player_inventory",
    untrusted: true,
    title: "Inventory or ender chest",
    description: `Main inventory, armor, and offhand with full item data, or the ender chest. ${SLOT_LAYOUT} ${OFFLINE_NOTE}`,
    scope: "read",
    effect: "read",
    input: { player, container },
    run: (args) =>
      args.container === "enderchest"
        ? unwrap(api.GET("/players/{player}/enderchest", who(args.player)), token)
        : unwrap(api.GET("/players/{player}/inventory", who(args.player)), token),
  });

  tool(ctx, {
    name: "get_player_effects",
    title: "Effects",
    description: `Active potion effects. ${OFFLINE_NOTE}`,
    scope: "read",
    effect: "read",
    input: { player },
    run: (args) => unwrap(api.GET("/players/{player}/effects", who(args.player)), token),
  });

  tool(ctx, {
    name: "get_player_statistics",
    title: "Statistics",
    description:
      "Vanilla statistics by category (custom, mined, broken, crafted, used, picked_up, dropped, killed, killed_by); live while online. play_time is in ticks (20 per second); distances in centimeters.",
    scope: "read",
    effect: "read",
    input: { player, category: z.string().optional().describe("Only one category, such as `mined`") },
    run: (args) =>
      unwrap(
        api.GET("/players/{player}/statistics", {
          params: { path: { player: args.player }, query: { category: args.category } },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "get_player_advancements",
    title: "Advancements",
    description:
      "Every advancement on the server with its title, description, frame, and parent, done or not, and when it was finished. done false lists what's left: with the parents, it shows what to go for next.",
    scope: "read",
    effect: "read",
    input: { player, done: z.boolean().optional().describe("Only finished (true) or unfinished (false)") },
    run: (args) =>
      unwrap(
        api.GET("/players/{player}/advancements", {
          params: { path: { player: args.player }, query: { done: args.done } },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "get_player_sessions",
    title: "Play sessions",
    description: "When the player joined and left, newest first, as WorldAPI recorded them.",
    scope: "read",
    effect: "read",
    input: { player, limit, cursor },
    run: (args) =>
      unwrap(
        api.GET("/players/{player}/sessions", {
          params: { path: { player: args.player }, query: { limit: args.limit, cursor: args.cursor } },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "check_permission",
    title: "Permissions",
    description: "Whether a player is an operator and, if online, whether they have a permission node.",
    scope: "read",
    effect: "read",
    input: { player, node: z.string().optional().describe("Such as `worldedit.wand`") },
    run: (args) =>
      unwrap(
        api.GET("/players/{player}/permissions", {
          params: { path: { player: args.player }, query: { node: args.node } },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "teleport_player",
    title: "Teleport a player",
    description: `Teleport to coordinates, to another player, or to a world's spawn; give exactly one. Check get_highest_block first to land on solid ground. ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "write",
    input: {
      player,
      location: location.optional(),
      toPlayer: z.string().optional().describe("Another player's name or UUID"),
      worldSpawn: z.string().optional().describe("A world name"),
    },
    run: (args) =>
      unwrap(
        api.POST("/players/{player}/teleport", {
          ...who(args.player),
          body: { location: args.location, player: args.toPlayer, worldSpawn: args.worldSpawn },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "set_player_property",
    title: "Change a player",
    description: `Set game mode, health, food (0–20), saturation, XP level or progress, flight, walk or fly speed (-1 to 1; defaults 0.2 and 0.1), display or tab-list name, invulnerability, fire, or air. ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "write",
    input: {
      player,
      gameMode: z.enum(["survival", "creative", "adventure", "spectator"]).optional(),
      health: z.number().min(0).optional(),
      food: z.number().int().min(0).max(20).optional(),
      saturation: z.number().min(0).max(20).optional(),
      exhaustion: z.number().min(0).optional(),
      level: z.number().int().min(0).optional(),
      exp: z.number().min(0).max(1).optional().describe("Progress to the next level"),
      allowFlight: z.boolean().optional(),
      flying: z.boolean().optional(),
      walkSpeed: z.number().min(-1).max(1).optional(),
      flySpeed: z.number().min(-1).max(1).optional(),
      displayName: z.string().optional(),
      listName: z.string().optional(),
      format,
      invulnerable: z.boolean().optional(),
      fireTicks: z.number().int().optional(),
      remainingAir: z.number().int().optional(),
    },
    run: ({ player: name, ...body }) => unwrap(api.PATCH("/players/{player}", { ...who(name), body }), token),
  });

  tool(ctx, {
    name: "send_message",
    title: "Message a player",
    description: `Send one player a chat message, title, or action bar text, optionally with a sound. ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "write",
    input: {
      player,
      message: z.string().min(1),
      kind: z.enum(["chat", "title", "actionbar"]).default("chat"),
      subtitle: z.string().optional(),
      sound: z.string().optional().describe("Such as `minecraft:entity.experience_orb.pickup`"),
      format,
    },
    run: ({ player: name, ...body }) => unwrap(api.POST("/players/{player}/message", { ...who(name), body }), token),
  });

  tool(ctx, {
    name: "kick_player",
    title: "Kick a player",
    description: "Disconnect a player with an optional reason.",
    scope: "admin",
    effect: "destructive",
    input: { player: anyPlayer, reason: z.string().optional(), format },
    run: ({ player: name, ...body }) => unwrap(api.POST("/players/{player}/kick", { ...who(name), body }), token),
  });

  tool(ctx, {
    name: "give_item",
    title: "Give an item",
    description: `Add an item to a player's inventory (what doesn't fit drops at their feet) or ender chest. ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "write",
    input: { player, item, container },
    run: (args) =>
      unwrap(
        args.container === "enderchest"
          ? api.POST("/players/{player}/enderchest/give", { ...who(args.player), body: { item: args.item } })
          : api.POST("/players/{player}/inventory/give", { ...who(args.player), body: { item: args.item } }),
        token,
      ),
  });

  tool(ctx, {
    name: "edit_inventory",
    title: "Edit an inventory",
    description: `Change a player's inventory or ender chest: \`set\` puts an item in a slot, replacing what was there; \`clear_slot\` empties one slot; \`clear\` empties everything, armor and offhand included. Cleared items are gone. To add items without picking a slot, use give_item. ${SLOT_LAYOUT} ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "destructive",
    input: {
      player,
      action: z.enum(["set", "clear_slot", "clear"]),
      slot: z.number().int().min(0).optional().describe("For set and clear_slot"),
      item: item.optional().describe("For set"),
      container,
    },
    run: (args) => {
      const ender = args.container === "enderchest";
      if (args.action === "clear")
        return unwrap(
          ender
            ? api.DELETE("/players/{player}/enderchest", who(args.player))
            : api.DELETE("/players/{player}/inventory", who(args.player)),
          token,
        );
      if (args.slot === undefined) throw new Error(`${args.action} needs slot`);
      const params = { params: { path: { player: args.player, slot: args.slot } } };
      if (args.action === "clear_slot")
        return unwrap(
          ender
            ? api.DELETE("/players/{player}/enderchest/slots/{slot}", params)
            : api.DELETE("/players/{player}/inventory/slots/{slot}", params),
          token,
        );
      if (!args.item) throw new Error("set needs item");
      return unwrap(
        ender
          ? api.PATCH("/players/{player}/enderchest/slots/{slot}", { ...params, body: args.item })
          : api.PATCH("/players/{player}/inventory/slots/{slot}", { ...params, body: args.item }),
        token,
      );
    },
  });

  const effect = z.object({
    type: z.string().min(1).describe("Such as `minecraft:speed`"),
    durationSeconds: z.number().int().positive().optional().describe("Leave out for an infinite effect"),
    amplifier: z.number().int().min(0).max(255).default(0).describe("0 is level I"),
    ambient: z.boolean().default(false),
    particles: z.boolean().default(true),
    icon: z.boolean().default(true),
  });

  tool(ctx, {
    name: "set_effects",
    title: "Change potion effects",
    description: `Give, take away, or clear a player's potion effects, in that order: clear first, then remove, then add. Answers with the effects the player has afterwards. ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "write",
    input: {
      player,
      add: z.array(effect).optional(),
      remove: z.array(z.string().min(1)).optional().describe("Effect keys to take away"),
      clear: z.boolean().optional().describe("Take away every effect first"),
    },
    run: async (args) => {
      if (args.clear) await unwrap(api.DELETE("/players/{player}/effects", who(args.player)), token);
      for (const type of args.remove ?? [])
        await unwrap(
          api.DELETE("/players/{player}/effects/{effect}", { params: { path: { player: args.player, effect: type } } }),
          token,
        );
      for (const body of args.add ?? [])
        await unwrap(api.POST("/players/{player}/effects", { ...who(args.player), body }), token);
      return unwrap(api.GET("/players/{player}/effects", who(args.player)), token);
    },
  });

  tool(ctx, {
    name: "set_advancement",
    title: "Grant or revoke an advancement",
    description: `Complete every criterion of an advancement for a player (done true), or take them all back (done false). ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "idempotent",
    input: {
      player,
      key: z.string().min(1).describe("Advancement key, such as `minecraft:story/mine_diamond`"),
      done: z.boolean(),
    },
    run: (args) => {
      const params = { params: { path: { player: args.player, key: args.key } } };
      return unwrap(
        args.done
          ? api.POST("/players/{player}/advancements/{key}", { ...params, body: {} })
          : api.DELETE("/players/{player}/advancements/{key}", params),
        token,
      );
    },
  });
}
