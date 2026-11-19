import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import { cursor, limit, segment } from "./common.js";

export function statsTools(ctx: Context): void {
  const { api } = ctx;

  tool(ctx, {
    name: "get_leaderboard",
    title: "Leaderboards and totals",
    description:
      "Players ranked by statistics, up to 5 boards, ties sharing a place. Presets: playtime (hours), diamonds, advancements, mobs, travel (km), deaths, blocks, fish, damage (hearts), netherite, experience, tamed. Or any statistic as `category:key`, such as `mined:diamond_ore` or `killed:*`. Without statistics, the presets and everyone's totals: hours, blocks mined, mobs killed, deaths, advancements, world day.",
    scope: "players:read",
    effect: "read",
    input: {
      statistics: z.array(segment).min(1).max(5).optional().describe('Such as ["playtime", "custom:jump"]'),
      limit: z.number().int().min(1).max(500).optional().describe("Players per board, 10 by default"),
    },
    run: async (args) => {
      if (!args.statistics) {
        const [presets, totals] = await Promise.all([
          unwrap(api.GET("/leaderboards"), ctx.token),
          unwrap(api.GET("/aggregates"), ctx.token),
        ]);
        return { presets, totals };
      }
      const boards = await Promise.all(
        args.statistics.map((statistic) =>
          unwrap(
            api.GET("/leaderboards/{statistic}", {
              params: { path: { statistic }, query: { limit: args.limit ?? 10 } },
            }),
            ctx.token,
          ).catch((error: Error & { code?: string }) => ({ statistic, error: error.code ?? error.message })),
        ),
      );
      return boards.length === 1 ? boards[0] : boards;
    },
  });

  tool(ctx, {
    name: "get_recipes",
    untrusted: true,
    title: "Recipes",
    description:
      "How to make an `item`, or what an item is good for (`uses`), or both: crafting grids with their shape, smelting and cooking with time and experience, stonecutting, and smithing, plugins' recipes included. Each ingredient lists the items that fit.",
    scope: "server:read",
    effect: "read",
    input: {
      item: z.string().min(1).optional().describe("Such as `minecraft:torch`"),
      uses: z.string().min(1).optional(),
      limit,
      cursor,
    },
    run: (args) => {
      if (!args.item && !args.uses) throw new Error("Give item, uses, or both");
      return unwrap(api.GET("/recipes", { params: { query: { ...args, limit: args.limit ?? 20 } } }), ctx.token);
    },
  });
}
