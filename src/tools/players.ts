import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import {
  count,
  cursor,
  each,
  format,
  ITEM_DETAIL,
  inOrder,
  limit,
  location,
  OFFLINE_NOTE,
  playerOrMe,
  players,
  SLOT_LAYOUT,
  segment,
} from "./common.js";

export function playerTools(ctx: Context): void {
  const { api } = ctx;
  const who = (name: string) => ({ params: { path: { player: name } } });
  const player = playerOrMe(ctx.player);

  tool(ctx, {
    name: "list_players",
    untrusted: true,
    title: "Players",
    description:
      "Everyone who has played here: online, first and last seen, playtime in seconds. online true lists who plays now instead, with world, game mode, health, food, level, ping, idle time, and location.",
    scope: "players:read",
    effect: "read",
    input: {
      online: z.boolean().optional(),
      sort: z.enum(["name", "last_seen", "playtime"]).optional(),
      limit,
      cursor,
    },
    run: (args) =>
      args.online
        ? unwrap(api.GET("/players/online"), ctx.token)
        : unwrap(api.GET("/players", { params: { query: args } }), ctx.token),
  });

  tool(ctx, {
    name: "get_player",
    untrusted: true,
    title: "Player",
    description: `A player's profile and, while online, state: game mode, health, food, XP, location, flight, ping, client. include adds \`inventory\` and \`enderchest\` (${SLOT_LAYOUT}), \`effects\`, \`deaths\` (newest 5 with causes), \`sessions\`, \`statistics\`, \`advancements\` (counts, newest 5), and \`target\` (the block and entity they look at). statistics lists every statistic, or a category: custom, mined, broken, crafted, used, picked_up, dropped, killed, killed_by. advancements lists each with its parent: \`todo\` shows what to go for next. permission checks a node such as \`worldedit.wand\`. Coordinates, inventories, and deaths need players:private. ${ITEM_DETAIL}`,
    scope: "players:read",
    effect: "read",
    input: {
      player: player.optional(),
      players: players.max(10).optional().describe("Up to 10 instead of player"),
      include: z
        .array(
          z.enum(["inventory", "enderchest", "effects", "deaths", "sessions", "statistics", "advancements", "target"]),
        )
        .optional(),
      statistics: z.string().min(1).optional().describe("`all`, or a category"),
      advancements: z.enum(["all", "done", "todo"]).optional(),
      permission: z.string().min(1).optional(),
    },
    run: async (args) => {
      const one = async (name: string) => {
        const [view, statistics, advancements, permission] = await Promise.all([
          unwrap(
            api.GET("/players/{player}", {
              params: { path: { player: name }, query: { include: args.include?.join(",") } },
            }),
            ctx.token,
          ),
          args.statistics
            ? unwrap(
                api.GET("/players/{player}/statistics", {
                  params: {
                    path: { player: name },
                    query: { category: args.statistics === "all" ? undefined : args.statistics },
                  },
                }),
                ctx.token,
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
                ctx.token,
              )
            : undefined,
          args.permission
            ? unwrap(
                api.GET("/players/{player}/permissions", {
                  params: { path: { player: name }, query: { node: args.permission } },
                }),
                ctx.token,
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
    description: `Teleport one or more players to coordinates, another player, or a world's spawn: give exactly one. Check the surface with get_block (no y) to land on solid ground. Each player is answered on its own. ${OFFLINE_NOTE}`,
    scope: "players:write",
    effect: "write",
    untrusted: true,
    input: {
      player: player.optional(),
      players: players.max(50).optional().describe("Several instead of player"),
      location: location.optional(),
      toPlayer: z.string().optional().describe("Name or UUID"),
      worldSpawn: z.string().optional().describe("A world name"),
    },
    run: async (args) => {
      const body = { location: args.location, player: args.toPlayer, worldSpawn: args.worldSpawn };
      const send = (name: string) => unwrap(api.POST("/players/{player}/teleport", { ...who(name), body }), ctx.token);
      if (args.players) return each(args.players, (name) => ({ player: name }), send);
      const name = args.player ?? ctx.player;
      if (!name) throw new Error("Give player or players");
      return send(name);
    },
  });

  tool(ctx, {
    name: "set_player_property",
    title: "Change a player",
    description: `Set game mode, health (0 kills), food, saturation, XP, flight, walk or fly speed, display or tab-list name, invulnerability, fire, or air. ${OFFLINE_NOTE}`,
    scope: "players:write",
    effect: "destructive",
    untrusted: true,
    input: {
      player,
      gameMode: z.enum(["survival", "creative", "adventure", "spectator"]).optional(),
      health: z.number().min(0).optional().describe("2 per heart"),
      food: z.number().int().min(0).max(20).optional(),
      saturation: z.number().min(0).max(20).optional(),
      exhaustion: z.number().min(0).optional().describe("4 costs a point of saturation or food"),
      level: count().optional(),
      exp: z.number().min(0).max(1).optional().describe("Progress to the next level"),
      allowFlight: z.boolean().optional(),
      flying: z.boolean().optional(),
      walkSpeed: z.number().min(-1).max(1).optional().describe("0.2 is normal"),
      flySpeed: z.number().min(-1).max(1).optional().describe("0.1 is normal"),
      displayName: z.string().optional(),
      listName: z.string().optional().describe("Tab list"),
      format,
      invulnerable: z.boolean().optional(),
      fireTicks: count().optional().describe("20 a second"),
      remainingAir: count().optional().describe("Ticks, 300 is full"),
    },
    run: ({ player: name, ...body }) => unwrap(api.PATCH("/players/{player}", { ...who(name), body }), ctx.token),
  });

  tool(ctx, {
    name: "send_message",
    title: "Message players",
    description:
      "Send a chat message, title, or action bar text to players, or to everyone online when players is left out. A sound plays only for named players. Each named player is answered on its own.",
    scope: "players:write",
    effect: "write",
    input: {
      players: players.optional(),
      message: z.string().min(1),
      kind: z.enum(["chat", "title", "actionbar"]).default("chat"),
      subtitle: z.string().optional(),
      sound: z.string().optional().describe("Such as `minecraft:entity.experience_orb.pickup`"),
      format,
    },
    run: async ({ players, sound, ...body }) => {
      if (!players) return unwrap(api.POST("/server/broadcast", { body }), ctx.token);
      const sent = await each(
        players,
        (name) => ({ player: name }),
        (name) => unwrap(api.POST("/players/{player}/message", { ...who(name), body: { ...body, sound } }), ctx.token),
      );
      return sent.length === 1 ? sent[0] : sent;
    },
  });

  const effect = z.object({
    type: segment.describe("Such as `minecraft:speed`"),
    durationSeconds: z.number().int().positive().max(1_000_000).optional().describe("Infinite when left out"),
    amplifier: z.number().int().min(0).max(255).default(0).describe("0 is level I"),
    ambient: z.boolean().default(false),
    particles: z.boolean().default(true),
    icon: z.boolean().default(true),
  });

  tool(ctx, {
    name: "set_effects",
    title: "Change potion effects",
    description: `Change a player's potion effects: clear first, then remove, then add, and answer with the effects afterwards. A failed step stops the rest, and the answer says what was done, what failed, and what wasn't. ${OFFLINE_NOTE}`,
    scope: "players:write",
    effect: "write",
    input: {
      player,
      add: z.array(effect).optional(),
      remove: z.array(segment).optional().describe("Effect keys"),
      clear: z.boolean().optional().describe("Every effect"),
    },
    run: async (args) => {
      type Step = { clear: true } | { remove: string } | { add: z.infer<typeof effect> };
      const steps: Step[] = [
        ...(args.clear ? [{ clear: true as const }] : []),
        ...(args.remove ?? []).map((type) => ({ remove: type })),
        ...(args.add ?? []).map((body) => ({ add: body })),
      ];
      const done = await inOrder(
        steps,
        (step) => ("add" in step ? { add: step.add.type } : step),
        async (step) => {
          if ("clear" in step) await unwrap(api.DELETE("/players/{player}/effects", who(args.player)), ctx.token);
          else if ("remove" in step)
            await unwrap(
              api.DELETE("/players/{player}/effects/{effect}", {
                params: { path: { player: args.player, effect: step.remove } },
              }),
              ctx.token,
            );
          else await unwrap(api.POST("/players/{player}/effects", { ...who(args.player), body: step.add }), ctx.token);
          return {};
        },
      );
      if (done.failed) return done;
      return unwrap(api.GET("/players/{player}/effects", who(args.player)), ctx.token);
    },
  });

  tool(ctx, {
    name: "set_advancement",
    title: "Grant or revoke advancements",
    description: `Complete every criterion of advancements for a player, or take them all back. Each key is answered on its own. ${OFFLINE_NOTE}`,
    scope: "players:write",
    effect: "idempotent",
    input: {
      player,
      keys: z.array(segment).min(1).max(50).describe('Such as ["minecraft:story/mine_diamond"]'),
      done: z.boolean().describe("false revokes"),
    },
    run: async (args) => {
      const results = await each(
        args.keys,
        (key) => ({ key }),
        (key) => {
          const params = { params: { path: { player: args.player, key } } };
          return unwrap(
            args.done
              ? api.POST("/players/{player}/advancements/{key}", { ...params, body: {} })
              : api.DELETE("/players/{player}/advancements/{key}", params),
            ctx.token,
          );
        },
      );
      return results.length === 1 ? results[0] : results;
    },
  });
}
