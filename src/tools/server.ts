import { z } from "zod";
import { unwrap } from "../client.js";
import { waitForEvent } from "../events.js";
import { type Context, tool } from "../tool.js";
import { cursor, format, limit, player } from "./common.js";

export function serverTools(ctx: Context): void {
  const { api, token } = ctx;

  tool(ctx, {
    name: "get_server_status",
    title: "Server status",
    description:
      "Version, Paper build, MOTD, players online and max, uptime, difficulty, view distance, worlds, tick rate, and current load: TPS over 1, 5, and 15 minutes (20 is perfect), milliseconds per tick, memory used and max in MB, loaded chunks, and entities. detail adds tick time percentiles (under 50 ms keeps 20 TPS), CPU, and chunks, entities, and the most common entity types per world.",
    scope: "read",
    effect: "read",
    input: { detail: z.boolean().optional().describe("Add percentiles, CPU, and per-world load") },
    run: async (args) => {
      const [status, performance] = await Promise.all([
        unwrap(api.GET("/server"), token),
        args.detail ? unwrap(api.GET("/server/performance"), token) : undefined,
      ]);
      return performance ? { ...status, performance } : status;
    },
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
      "Recorded events, newest first: player.join, player.leave, player.kick, player.death, player.advancement, player.chat (if the server records chat), world.night_skipped, entity.boss_killed, raid.start, raid.finish, server.status, and plugins’ own `ext.<namespace>.<event>` types from `list_extensions`. Filter by type, player, and time.",
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
    name: "wait_for_event",
    untrusted: true,
    title: "Wait for something to happen",
    description:
      "Wait until an event happens live and get it, or time out. Types are WebSocket topics: player.join, player.leave, player.death, player.advancement, player.chat (if the server records chat), player.command (admin), player.respawn, player.level_up, player.sleep, player.world_change, player.kill, player.craft, block.break, block.place, world.weather, world.night_skipped, entity.boss_killed, raid.start, raid.finish, server.status, and more. Narrow it to one player or world. Use it for “tell me when Steve logs in” or “wait until night is skipped”. Keep timeoutSeconds within what your client lets a tool run.",
    scope: "read",
    effect: "read",
    input: {
      types: z.array(z.string().min(1)).min(1).describe('Such as ["player.join"]'),
      player: player.optional().describe("Only this player's events"),
      world: z.string().optional().describe("Only this world's events"),
      timeoutSeconds: z.number().int().min(1).max(300).default(60),
    },
    run: (args) =>
      waitForEvent(
        { url: ctx.url, token },
        { types: args.types, player: args.player, world: args.world, timeoutMs: args.timeoutSeconds * 1000 },
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
    name: "get_server_log",
    untrusted: true,
    title: "Console log",
    description:
      "Recent console lines, oldest first: errors, warnings, plugin messages, joins, chat, and commands players ran. WorldAPI keeps them from its own start (1000 by default) and blanks out its tokens. Filter by the lowest level and by text, such as a player's name or a plugin's.",
    scope: "admin",
    effect: "read",
    input: {
      level: z
        .enum(["trace", "debug", "info", "warn", "error", "fatal"])
        .optional()
        .describe("Only this level and above"),
      grep: z.string().min(1).optional().describe("Only lines that contain this text, ignoring case"),
      limit: z.number().int().min(1).optional().describe("Newest matching lines to return; 100 by default"),
    },
    run: (args) => unwrap(api.GET("/server/logs", { params: { query: args } }), token),
  });

  tool(ctx, {
    name: "restart_server",
    title: "Restart the server",
    description:
      "Restart after a countdown in chat: players see warnings at set marks, then every world and player is saved and the server stops. Whatever runs the server must start it again (Docker's restart policy, a start script loop); otherwise it stays off. Scheduling again replaces a pending restart; cancel calls it off. Everyone online gets disconnected, so confirm with the user first.",
    scope: "admin",
    effect: "destructive",
    input: {
      countdownSeconds: z.number().int().min(0).max(3600).default(60),
      message: z.string().optional().describe("Said with each warning, such as the reason"),
      cancel: z.boolean().optional().describe("Call off a pending restart instead"),
    },
    run: (args) =>
      args.cancel
        ? unwrap(api.DELETE("/server/restart"), token)
        : unwrap(
            api.POST("/server/restart", { body: { countdownSeconds: args.countdownSeconds, message: args.message } }),
            token,
          ),
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
    name: "get_access",
    title: "Whitelist, operators, and bans",
    description:
      "Who may play and who runs the server: whether the whitelist is on and enforced and who is on it, the operators, and banned players and IP addresses with reasons and expiry.",
    scope: "admin",
    effect: "read",
    input: {},
    run: async () => {
      const [whitelist, operators, bans] = await Promise.all([
        unwrap(api.GET("/server/whitelist"), token),
        unwrap(api.GET("/server/ops"), token),
        unwrap(api.GET("/server/bans"), token),
      ]);
      return { whitelist, operators, bans };
    },
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

  const ban = z.object({
    reason: z.string().optional(),
    durationSeconds: z.number().int().positive().optional().describe("Leave out for a permanent ban"),
  });

  tool(ctx, {
    name: "manage_bans",
    title: "Ban or pardon",
    description:
      "Ban players by name or UUID, or IP addresses; anyone online who is banned gets kicked. Pardon lifts a ban. Give any of the four lists in one call.",
    scope: "admin",
    effect: "destructive",
    input: {
      ban: z.array(ban.extend({ player: z.string().min(1) })).optional(),
      pardon: z.array(z.string().min(1)).optional().describe("Player names or UUIDs"),
      banIps: z.array(ban.extend({ ip: z.string().min(1) })).optional(),
      pardonIps: z.array(z.string().min(1)).optional(),
    },
    run: (args) =>
      unwrap(
        api.PATCH("/server/bans", {
          body: {
            ban: args.ban ?? [],
            pardon: args.pardon ?? [],
            banIps: args.banIps ?? [],
            pardonIps: args.pardonIps ?? [],
          },
        }),
        token,
      ),
  });
}
