/**
 * Longer how-tos that tools hand out on request instead of carrying them in every session's schema.
 */

/** How the user gets what manage_webhook's create needs, per service. list_webhooks with options returns it. */
export const WEBHOOK_GUIDE = `# Connecting a webhook

How the user gets what \`manage_webhook\` with \`create\` needs:

- **discord**: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.
- **slack**: api.slack.com/apps → an app → Incoming Webhooks → Add New Webhook. Mattermost and Rocket.Chat take this format too.
- **teams**: the channel → Workflows → “Post to a channel when a webhook request is received”, then its URL.
- **google_chat**: the space → Apps & integrations → Webhooks.
- **telegram**: make a bot with @BotFather and get its token. The user writes /start to the bot, or adds it to a group or channel. Then \`telegram_chats\` with \`botToken\` lists the chats, and one's id is \`chatId\`.
- **json**: any HTTPS URL that takes the event as JSON. The answer holds a signing secret, shown once.

These URLs and bot tokens are secrets: ask the user to paste them, never invent them, and don't repeat them back.

Addresses must be https://. Ones on the server's machine or private network are refused unless the owner allows them in config.yml.
`;
