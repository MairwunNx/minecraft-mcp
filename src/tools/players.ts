import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import { cursor, format, item, limit, location, OFFLINE_NOTE, player, SLOT_LAYOUT } from "./common.js";

const container = z.enum(["inventory", "enderchest"]).default("inventory");

export function playerTools(ctx: Context): void {
  const { api, token } = ctx;
  const who = (name: string) => ({ params: { path: { player: name } } });

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
    title: "Inventory",
    description: `Main inventory, armor, and offhand with full item data. ${SLOT_LAYOUT} ${OFFLINE_NOTE}`,
    scope: "read",
    effect: "read",
    input: { player },
    run: (args) => unwrap(api.GET("/players/{player}/inventory", who(args.player)), token),
  });

  tool(ctx, {
    name: "get_player_enderchest",
    untrusted: true,
    title: "Ender chest",
    description: `Ender chest contents. ${OFFLINE_NOTE}`,
    scope: "read",
    effect: "read",
    input: { player },
    run: (args) => unwrap(api.GET("/players/{player}/enderchest", who(args.player)), token),
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
    description: "Advancements with titles, done or in progress, and when they were finished.",
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
    input: { player, reason: z.string().optional(), format },
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
    name: "set_inventory_slot",
    title: "Set a slot",
    description: `Put an item in one slot, replacing what was there. ${SLOT_LAYOUT} ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "idempotent",
    input: { player, slot: z.number().int().min(0), item, container },
    run: (args) => {
      const params = { params: { path: { player: args.player, slot: args.slot } } };
      return unwrap(
        args.container === "enderchest"
          ? api.PATCH("/players/{player}/enderchest/slots/{slot}", { ...params, body: args.item })
          : api.PATCH("/players/{player}/inventory/slots/{slot}", { ...params, body: args.item }),
        token,
      );
    },
  });

  tool(ctx, {
    name: "clear_inventory_slot",
    title: "Empty a slot",
    description: `Empty one slot. ${SLOT_LAYOUT} ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "destructive",
    input: { player, slot: z.number().int().min(0), container },
    run: (args) => {
      const params = { params: { path: { player: args.player, slot: args.slot } } };
      return unwrap(
        args.container === "enderchest"
          ? api.DELETE("/players/{player}/enderchest/slots/{slot}", params)
          : api.DELETE("/players/{player}/inventory/slots/{slot}", params),
        token,
      );
    },
  });

  tool(ctx, {
    name: "clear_inventory",
    title: "Empty an inventory",
    description: `Empty a player's whole inventory, armor and offhand included, or their ender chest. The items are gone. ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "destructive",
    input: { player, container },
    run: (args) =>
      unwrap(
        args.container === "enderchest"
          ? api.DELETE("/players/{player}/enderchest", who(args.player))
          : api.DELETE("/players/{player}/inventory", who(args.player)),
        token,
      ),
  });

  tool(ctx, {
    name: "add_effect",
    title: "Give an effect",
    description: `Give a potion effect such as \`minecraft:speed\`. Amplifier 0 is level I; leave out durationSeconds for an infinite effect. ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "write",
    input: {
      player,
      type: z.string().min(1),
      durationSeconds: z.number().int().positive().optional(),
      amplifier: z.number().int().min(0).max(255).default(0),
      ambient: z.boolean().default(false),
      particles: z.boolean().default(true),
      icon: z.boolean().default(true),
    },
    run: ({ player: name, ...body }) => unwrap(api.POST("/players/{player}/effects", { ...who(name), body }), token),
  });

  tool(ctx, {
    name: "remove_effect",
    title: "Remove an effect",
    description: `Remove one potion effect. ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "idempotent",
    input: { player, type: z.string().min(1) },
    run: (args) =>
      unwrap(
        api.DELETE("/players/{player}/effects/{effect}", {
          params: { path: { player: args.player, effect: args.type } },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "clear_effects",
    title: "Remove all effects",
    description: `Remove every potion effect. ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "idempotent",
    input: { player },
    run: (args) => unwrap(api.DELETE("/players/{player}/effects", who(args.player)), token),
  });

  const advancement = z.string().min(1).describe("Advancement key, such as `minecraft:story/mine_diamond`");

  tool(ctx, {
    name: "grant_advancement",
    title: "Grant an advancement",
    description: `Complete every criterion of an advancement for a player. ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "idempotent",
    input: { player, key: advancement },
    run: (args) =>
      unwrap(
        api.POST("/players/{player}/advancements/{key}", {
          params: { path: { player: args.player, key: args.key } },
          body: {},
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "revoke_advancement",
    title: "Revoke an advancement",
    description: `Take back every criterion of an advancement. ${OFFLINE_NOTE}`,
    scope: "write:players",
    effect: "idempotent",
    input: { player, key: advancement },
    run: (args) =>
      unwrap(
        api.DELETE("/players/{player}/advancements/{key}", {
          params: { path: { player: args.player, key: args.key } },
        }),
        token,
      ),
  });
}
