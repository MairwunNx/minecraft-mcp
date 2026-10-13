import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "player_whereabouts",
    {
      title: "Where is a player",
      description: "Find a player and describe what is around them",
      argsSchema: { player: z.string().describe("Player name") },
    },
    ({ player }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Where is ${player} in the Minecraft world, and what is near them?`,
              "Use get_player for their world, coordinates, health, and game mode. If they are offline, say when they were last seen and where they logged out.",
              "If they are online, use get_biome and get_block at their feet, list_entities within 32 blocks, and locate_structure for a village nearby.",
              "Answer in a few sentences a friend could act on: the dimension, rough coordinates, biome, threats or animals around, and the nearest landmark.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "server_health_check",
    { title: "Server health check", description: "Check performance, load, and recent trouble" },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Check the health of the Minecraft server.",
              "Use get_server_status with detail: TPS should be near 20 and the p95 tick time under 50 ms; memory use near the max is a warning sign.",
              "Use list_worlds and get_world with size to see which world carries the most chunks and entities, and get_events for recent server.status changes, kicks, and deaths.",
              "Report what is fine, what needs attention, and one concrete next step for each problem. Don't change anything.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
