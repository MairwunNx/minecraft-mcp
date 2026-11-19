import { z } from "zod";
import { unwrap } from "../client.js";
import { WEBHOOK_GUIDE } from "../guides.js";
import { type Context, tool } from "../tool.js";

const FORMATS = ["discord", "slack", "telegram", "teams", "google_chat", "json"] as const;
const LANGUAGES = ["en", "ru", "es", "pt", "de"] as const;

export function webhookTools(ctx: Context): void {
  const { api } = ctx;

  tool(ctx, {
    name: "list_webhooks",
    title: "Webhooks",
    description:
      "Webhooks that send server events to Discord, Slack, Telegram, Microsoft Teams, Google Chat, or a URL as JSON: each one's service, events, language, whether it's on, and its address with the secret hidden. options adds the services, languages, every event with the permission it needs, the message keys its own words may replace, and a `guide` to how the user gets each service's URL or bot token.",
    scope: "webhooks:manage",
    effect: "read",
    input: { options: z.boolean().optional().describe("Add what a webhook can be, and the guide") },
    run: async (args) => {
      const [webhooks, options] = await Promise.all([
        unwrap(api.GET("/webhooks"), ctx.token),
        args.options ? unwrap(api.GET("/webhooks/options"), ctx.token) : undefined,
      ]);
      return options ? { webhooks, options, guide: WEBHOOK_GUIDE } : webhooks;
    },
  });

  tool(ctx, {
    name: "manage_webhook",
    title: "Connect Discord, Slack, Telegram, and more",
    description:
      "Connect the server to a chat: “send deaths to my Discord”, “post joins to Telegram in Russian”. `create` makes one and sends a test message. `update` changes it, or pauses it. `test` works once per webhook every 10 seconds. `telegram_chats` lists the chats a Telegram bot can write to. list_webhooks with options has a `guide` to getting each service's URL or bot token. These are secrets: ask the user to paste them, never invent or repeat them. A webhook sees no coordinates and no chat unless permissions widen that, up to this token's own. Webhooks in config.yml change only there.",
    scope: "webhooks:manage",
    effect: "destructive",
    input: {
      action: z.enum(["create", "update", "delete", "test", "telegram_chats"]),
      name: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,32}$/)
        .optional()
        .describe("For create, a new one such as discord-deaths"),
      format: z.enum(FORMATS).optional().describe("For create"),
      url: z.string().url().optional().describe("For create, but not telegram"),
      botToken: z.string().optional().describe("Telegram's"),
      chatId: z.string().optional().describe("Telegram's"),
      topics: z
        .array(z.string().min(1))
        .min(1)
        .optional()
        .describe('Event ids, such as ["player.death"], ["player.*"], or ["*"] for every notable one'),
      language: z.enum(LANGUAGES).optional().describe("English by default"),
      messages: z
        .record(z.string(), z.string().min(1).max(500))
        .optional()
        .describe('Own words by message key, such as {"player.death": "RIP: {message}"}'),
      permissions: z.array(z.string()).optional().describe('Such as ["chat:read"]'),
      enabled: z.boolean().optional().describe("false pauses it"),
    },
    run: async (args) => {
      const need = <T>(value: T | undefined, what: string): T => {
        if (value === undefined) throw new Error(`${args.action} needs ${what}`);
        return value;
      };
      switch (args.action) {
        case "create":
          return unwrap(
            api.POST("/webhooks", {
              body: {
                name: need(args.name, "name"),
                format: need(args.format, "format"),
                url: args.url,
                botToken: args.botToken,
                chatId: args.chatId,
                topics: need(args.topics, "topics"),
                language: args.language ?? "en",
                messages: args.messages ?? {},
                permissions: args.permissions ?? [],
                test: true,
              },
            }),
            ctx.token,
          );
        case "update":
          return unwrap(
            api.PATCH("/webhooks/{name}", {
              params: { path: { name: need(args.name, "name") } },
              body: {
                topics: args.topics,
                language: args.language,
                messages: args.messages,
                permissions: args.permissions,
                enabled: args.enabled,
              },
            }),
            ctx.token,
          );
        case "delete":
          return unwrap(
            api.DELETE("/webhooks/{name}", { params: { path: { name: need(args.name, "name") } } }),
            ctx.token,
          );
        case "test":
          return unwrap(
            api.POST("/webhooks/{name}/test", { params: { path: { name: need(args.name, "name") } }, body: {} }),
            ctx.token,
          );
        case "telegram_chats":
          return unwrap(
            api.POST("/webhooks/telegram/chats", { body: { botToken: need(args.botToken, "botToken") } }),
            ctx.token,
          );
      }
    },
  });
}
