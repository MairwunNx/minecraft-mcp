import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import { cursor, format, ITEM_DETAIL, limit, location, OFFLINE_NOTE, playerOrMe, SLOT_LAYOUT } from "./common.js";

export function playerTools(ctx: Context): void {
  const { api, token } = ctx;
  const who = (name: string) => ({ params: { path: { player: name } } });
  const player = playerOrMe(ctx.player);

  tool(ctx, {
    name: "list_players",
    untrusted: true,
    title: "Players",
    description:
      "Everyone who has played here: online state, first and last seen, playtime in seconds; limit 0 only counts them. online true lists who is playing now instead, with world, game mode, health, food, level, ping, idle time, and location.",
    scope: "players:read",
    effect: "read",
    input: {
      online: z.boolean().optional().describe("true: who is online now, with their state"),
      sort: z.enum(["name", "last_seen", "playtime"]).optional(),
      limit,
      cursor,
    },
    run: (args) =>
      args.online
        ? unwrap(api.GET("/players/online"), token)
        : unwrap(api.GET("/players", { params: { query: args } }), token),
  });

  tool(ctx, {
    name: "get_player",
    untrusted: true,
    title: "Player",
    description: `A player's profile and, while online, full state: game mode, health, food, XP, location, flight, speed, ping, client. Offline players show their last location. players reads up to 10 at once. include adds parts in the same call: \`inventory\` and \`enderchest\` (from the saved player file while offline; ${SLOT_LAYOUT}), \`effects\` (online only), \`deaths\` (the last death place and the newest 5 with causes and killers), \`sessions\` (the newest 5), \`statistics\` (the general ones), \`advancements\` (counts and the newest 5), and \`target\` (online only: the block and the entity the player looks at within 64 blocks, and where their eyes are, for “what am I looking at”). statistics gives every vanilla statistic, or one category (custom, mined, broken, crafted, used, picked_up, dropped, killed, killed_by; play_time in ticks, distances in centimeters). advancements lists every advancement with title, description, frame, and parent: \`todo\` is what's left, and with the parents it shows what to go for next. permission says whether the player is an operator and, if online, has a permission node (a server permission, such as \`worldedit.wand\`). Coordinates, inventories, and death places need players:private. ${ITEM_DETAIL}`,
    scope: "players:read",
    effect: "read",
    input: {
      player: player.optional(),
      players: z.array(z.string().min(1)).min(1).max(10).optional().describe("Several players instead of one"),
      include: z
        .array(
          z.enum(["inventory", "enderchest", "effects", "deaths", "sessions", "statistics", "advancements", "target"]),
        )
        .optional()
        .describe('Parts to add, such as ["inventory", "deaths"]'),
      statistics: z.string().min(1).optional().describe("`all`, or one category such as `mined`"),
      advancements: z.enum(["all", "done", "todo"]).optional(),
      permission: z.string().min(1).optional().describe("A permission node to check"),
    },
    run: async (args) => {
      const one = async (name: string) => {
        const [view, statistics, advancements, permission] = await Promise.all([
          unwrap(
            api.GET("/players/{player}", {
              params: { path: { player: name }, query: { include: args.include?.join(",") } },
            }),
            token,
          ),
          args.statistics
            ? unwrap(
                api.GET("/players/{player}/statistics", {
                  params: {
                    path: { player: name },
                    query: { category: args.statistics === "all" ? undefined : args.statistics },
                  },
                }),
                token,
              )
            : undefined,
          args.advancements
            ? unwrap(
                api.GET("/players/{player}/advancements", {
                  params: {
                    path: { player: name },
                    query: { done: args.advancements === "all" ? undefined : args.advancements === "done" },
                  },
                }),
                token,
              )
            : undefined,
          args.permission
            ? unwrap(
                api.GET("/players/{player}/permissions", {
                  params: { path: { player: name }, query: { node: args.permission } },
                }),
                token,
              )
            : undefined,
        ]);
        return {
          ...view,
          ...(statistics && { allStatistics: statistics }),
          ...(advancements && { allAdvancements: advancements }),
          ...(permission && { permission }),
        };
      };
      if (args.players)
        return Promise.all(
          args.players.map((name) =>
            one(name).catch((error: Error & { code?: string }) => ({
              player: name,
              error: error.code ?? error.message,
            })),
          ),
        );
      const name = args.player ?? ctx.player;
      if (!name) throw new Error("Give player or players");
      return one(name);
    },
  });

  tool(ctx, {
    name: "teleport_player",
    title: "Teleport a player",
    description: `Teleport to coordinates, to another player, or to a world's spawn; give exactly one. Check the surface with get_block (no y) first to land on solid ground. ${OFFLINE_NOTE}`,
    scope: "players:write",
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
    scope: "players:write",
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
    title: "Message players",
    description:
      "Send a chat message, title, or action bar text to some players, or to everyone online when players is left out. A sound plays only for named players, who must be online.",
    scope: "players:write",
    effect: "write",
    input: {
      players: z.array(z.string().min(1)).min(1).optional().describe("Names or UUIDs; everyone online when left out"),
      message: z.string().min(1),
      kind: z.enum(["chat", "title", "actionbar"]).default("chat"),
      subtitle: z.string().optional().describe("Only for titles"),
      sound: z.string().optional().describe("Such as `minecraft:entity.experience_orb.pickup`"),
      format,
    },
    run: async ({ players, sound, ...body }) => {
      if (!players) return unwrap(api.POST("/server/broadcast", { body }), token);
      const sent = [];
      for (const name of players)
        sent.push({
          player: name,
          ...(await unwrap(api.POST("/players/{player}/message", { ...who(name), body: { ...body, sound } }), token)),
        });
      return sent.length === 1 ? sent[0] : sent;
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
    scope: "players:write",
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
    title: "Grant or revoke advancements",
    description: `Complete every criterion of advancements for a player (done true), or take them all back (done false). ${OFFLINE_NOTE}`,
    scope: "players:write",
    effect: "idempotent",
    input: {
      player,
      keys: z
        .array(z.string().min(1))
        .min(1)
        .max(50)
        .describe('Advancement keys, such as ["minecraft:story/mine_diamond"]'),
      done: z.boolean(),
    },
    run: async (args) => {
      const results = [];
      for (const key of args.keys) {
        const params = { params: { path: { player: args.player, key } } };
        results.push({
          key,
          ...(await unwrap(
            args.done
              ? api.POST("/players/{player}/advancements/{key}", { ...params, body: {} })
              : api.DELETE("/players/{player}/advancements/{key}", params),
            token,
          )),
        });
      }
      return results.length === 1 ? results[0] : results;
    },
  });
}
