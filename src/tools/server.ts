import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import { cursor, format, limit, player } from "./common.js";

export function serverTools(ctx: Context): void {
  const { api, token } = ctx;

  tool(ctx, {
    name: "get_server_status",
    title: "Server status",
    description:
      "Version, Paper build, MOTD, players online and max, uptime, difficulty, view distance, worlds, tick rate.",
    scope: "read",
    effect: "read",
    input: {},
    run: () => unwrap(api.GET("/server"), token),
  });

  tool(ctx, {
    name: "get_performance",
    title: "Server performance",
    description:
      "TPS over 1, 5, and 15 minutes (20 is perfect), milliseconds per tick with percentiles (under 50 keeps 20 TPS), memory, CPU load, and loaded chunks and entities per world.",
    scope: "read",
    effect: "read",
    input: {},
    run: () => unwrap(api.GET("/server/performance"), token),
  });

  tool(ctx, {
    name: "list_plugins",
    title: "Plugins",
    description: "Installed plugins with version and whether they are enabled.",
    scope: "read",
    effect: "read",
    input: {},
    run: () => unwrap(api.GET("/server/plugins"), token),
  });

  tool(ctx, {
    name: "get_events",
    untrusted: true,
    title: "Event history",
    description:
      "Recorded events, newest first: player.join, player.leave, player.kick, player.death, player.advancement, player.chat (if the server records chat), world.night_skipped, entity.boss_killed, raid.start, raid.finish, server.status. Filter by type, player, and time.",
    scope: "read",
    effect: "read",
    input: {
      types: z.array(z.string()).optional().describe('Event types, such as ["player.death"]'),
      player: z.string().optional().describe("Player name or UUID"),
      from: z.string().optional().describe("ISO-8601 time; only events at or after it"),
      to: z.string().optional().describe("ISO-8601 time; only events before it"),
      order: z.enum(["newest", "oldest"]).optional(),
      limit,
      cursor,
    },
    run: (args) =>
      unwrap(
        api.GET("/events", {
          params: {
            query: {
              type: args.types?.join(","),
              player: args.player,
              from: args.from,
              to: args.to,
              order: args.order,
              limit: args.limit ?? 50,
              cursor: args.cursor,
            },
          },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "broadcast",
    title: "Broadcast",
    description: "Send a chat message, title, or action bar text to everyone online.",
    scope: "admin",
    effect: "write",
    input: {
      message: z.string().min(1),
      kind: z.enum(["chat", "title", "actionbar"]).default("chat"),
      subtitle: z.string().optional().describe("Only for titles"),
      format,
    },
    run: (args) => unwrap(api.POST("/server/broadcast", { body: args }), token),
  });

  tool(ctx, {
    name: "run_command",
    untrusted: true,
    title: "Run a console command",
    description:
      "Run any console command as the server console, without the leading slash, and get its output. Powerful: prefer a specific tool when one exists. Every call is audit-logged.",
    scope: "admin",
    effect: "destructive",
    input: { command: z.string().min(1).describe("Such as `weather clear` or `give Steve minecraft:bread 16`") },
    run: (args) => unwrap(api.POST("/server/commands", { body: args }), token),
  });

  tool(ctx, {
    name: "save_worlds",
    title: "Save worlds",
    description: "Save every world, and player data, to disk now.",
    scope: "admin",
    effect: "idempotent",
    input: { players: z.boolean().default(true) },
    run: (args) => unwrap(api.POST("/server/save", { body: args }), token),
  });

  tool(ctx, {
    name: "get_whitelist",
    title: "Whitelist",
    description: "Whether the whitelist is on and enforced, and who is on it.",
    scope: "admin",
    effect: "read",
    input: {},
    run: () => unwrap(api.GET("/server/whitelist"), token),
  });

  tool(ctx, {
    name: "manage_whitelist",
    title: "Change the whitelist",
    description: "Turn the whitelist on or off, enforce it, and add or remove players by name or UUID.",
    scope: "admin",
    effect: "idempotent",
    input: {
      enabled: z.boolean().optional(),
      enforced: z.boolean().optional().describe("Kick online players who aren't on the list"),
      add: z.array(z.string()).optional(),
      remove: z.array(z.string()).optional(),
    },
    run: (args) =>
      unwrap(
        api.PATCH("/server/whitelist", { body: { ...args, add: args.add ?? [], remove: args.remove ?? [] } }),
        token,
      ),
  });

  tool(ctx, {
    name: "get_operators",
    title: "Operators",
    description: "Players with operator rights.",
    scope: "admin",
    effect: "read",
    input: {},
    run: () => unwrap(api.GET("/server/ops"), token),
  });

  tool(ctx, {
    name: "set_operator",
    title: "Grant or revoke operator",
    description: "Make a player an operator, or take it away.",
    scope: "admin",
    effect: "idempotent",
    input: { player, op: z.boolean() },
    run: (args) =>
      unwrap(
        api.PATCH("/server/ops", {
          body: args.op ? { add: [args.player], remove: [] } : { add: [], remove: [args.player] },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "get_bans",
    title: "Bans",
    description: "Banned players and IP addresses with reasons and expiry.",
    scope: "admin",
    effect: "read",
    input: {},
    run: () => unwrap(api.GET("/server/bans"), token),
  });

  tool(ctx, {
    name: "ban_player",
    title: "Ban a player",
    description:
      "Ban a player by name or UUID; an online player gets kicked. Leave out durationSeconds for a permanent ban.",
    scope: "admin",
    effect: "destructive",
    input: { player, reason: z.string().optional(), durationSeconds: z.number().int().positive().optional() },
    run: (args) =>
      unwrap(api.PATCH("/server/bans", { body: { ban: [args], pardon: [], banIps: [], pardonIps: [] } }), token),
  });

  tool(ctx, {
    name: "pardon_player",
    title: "Pardon a player",
    description: "Lift a player's ban.",
    scope: "admin",
    effect: "idempotent",
    input: { player },
    run: (args) =>
      unwrap(api.PATCH("/server/bans", { body: { ban: [], pardon: [args.player], banIps: [], pardonIps: [] } }), token),
  });

  tool(ctx, {
    name: "ban_ip",
    title: "Ban an IP address",
    description: "Ban an IP address; players connected from it get kicked.",
    scope: "admin",
    effect: "destructive",
    input: { ip: z.string(), reason: z.string().optional(), durationSeconds: z.number().int().positive().optional() },
    run: (args) =>
      unwrap(api.PATCH("/server/bans", { body: { ban: [], pardon: [], banIps: [args], pardonIps: [] } }), token),
  });

  tool(ctx, {
    name: "pardon_ip",
    title: "Pardon an IP address",
    description: "Lift an IP ban.",
    scope: "admin",
    effect: "idempotent",
    input: { ip: z.string() },
    run: (args) =>
      unwrap(api.PATCH("/server/bans", { body: { ban: [], pardon: [], banIps: [], pardonIps: [args.ip] } }), token),
  });
}
