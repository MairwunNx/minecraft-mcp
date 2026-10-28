import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";

const FORMATS = ["discord", "slack", "telegram", "teams", "google_chat", "json"] as const;
const LANGUAGES = ["en", "ru", "es", "pt", "de"] as const;

export function webhookTools(ctx: Context): void {
  const { api, token } = ctx;

  tool(ctx, {
    name: "list_webhooks",
    title: "Webhooks",
    description:
      "Webhooks that send server events to Discord, Slack, Telegram, Microsoft Teams, Google Chat, or a URL as JSON: each one's service, events, language, whether it's on, and its address with the secret part hidden. options adds what a webhook can be: the services, languages, every event with the permission it needs, and the message keys its own words may replace. Needs webhooks:manage.",
    scope: "webhooks:manage",
    effect: "read",
    input: { options: z.boolean().optional().describe("Add the services, languages, events, and message keys") },
    run: async (args) => {
      const [webhooks, options] = await Promise.all([
        unwrap(api.GET("/webhooks"), token),
        args.options ? unwrap(api.GET("/webhooks/options"), token) : undefined,
      ]);
      return options ? { webhooks, options } : webhooks;
    },
  });

  tool(ctx, {
    name: "manage_webhook",
    title: "Connect Discord, Slack, Telegram, and more",
    description: `Connect the server to a chat: “send deaths to my Discord”, “post joins to Telegram in Russian”. action create makes one and sends a test message; update changes its events, language, own words, access, or pauses it (enabled false); delete removes it; test sends a test message; telegram_chats lists the chats a Telegram bot can write to.
How the user gets what create needs:
- discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.
- slack: api.slack.com/apps → an app → Incoming Webhooks → Add New Webhook; Mattermost and Rocket.Chat take this format too.
- teams: the channel → Workflows → “Post to a channel when a webhook request is received”, then its URL.
- google_chat: the space → Apps & integrations → Webhooks.
- telegram: make a bot with @BotFather and get its token; the user writes /start to the bot, or adds it to a group or channel; then telegram_chats with botToken lists chats, and one's id is chatId.
- json: any HTTPS URL that takes the event as JSON; the answer holds a signing secret, shown once.
These URLs and bot tokens are secrets: ask the user to paste them, never invent them, and don't repeat them back. topics are event ids, \`player.*\` for a prefix, or \`*\` for every notable event (joins, leaves, deaths, advancements, chat, raids, bosses, the server starting and stopping). By default a webhook sees no coordinates and no chat; permissions widens that, but only up to this token's own. Addresses must be https://, and ones on the server's machine or private network are refused, unless the owner allows them in config.yml. test works once per webhook every 10 seconds. Webhooks in config.yml change only there. Needs webhooks:manage.`,
    scope: "webhooks:manage",
    effect: "destructive",
    input: {
      action: z.enum(["create", "update", "delete", "test", "telegram_chats"]),
      name: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,32}$/)
        .optional()
        .describe("The webhook; for create, a new name such as discord-deaths"),
      format: z.enum(FORMATS).optional().describe("For create"),
      url: z.string().url().optional().describe("For create, every format but telegram"),
      botToken: z.string().optional().describe("For create and telegram_chats, the Telegram bot's token"),
      chatId: z.string().optional().describe("For create with telegram"),
      topics: z.array(z.string().min(1)).min(1).optional().describe('Such as ["player.death"], ["player.*"], or ["*"]'),
      language: z.enum(LANGUAGES).optional().describe("Chat messages' language; English by default"),
      messages: z
        .record(z.string(), z.string().min(1).max(500))
        .optional()
        .describe(
          'Its own words by message key, such as {"player.death": "RIP: {message}"}; list_webhooks with options shows the keys and placeholders',
        ),
      permissions: z
        .array(z.string())
        .optional()
        .describe('What it may see, such as ["events:read", "chat:read"]; default: no coordinates, no chat'),
      enabled: z.boolean().optional().describe("For update: false pauses it"),
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
            token,
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
            token,
          );
        case "delete":
          return unwrap(api.DELETE("/webhooks/{name}", { params: { path: { name: need(args.name, "name") } } }), token);
        case "test":
          return unwrap(
            api.POST("/webhooks/{name}/test", { params: { path: { name: need(args.name, "name") } }, body: {} }),
            token,
          );
        case "telegram_chats":
          return unwrap(
            api.POST("/webhooks/telegram/chats", { body: { botToken: need(args.botToken, "botToken") } }),
            token,
          );
      }
    },
  });
}
