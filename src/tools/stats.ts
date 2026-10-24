import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import { cursor, limit } from "./common.js";

export function statsTools(ctx: Context): void {
  const { api, token } = ctx;

  tool(ctx, {
    name: "get_leaderboard",
    title: "Leaderboards and totals",
    description:
      "Players ranked by statistics, up to 5 boards at once; ties share a place. Presets: playtime (hours), diamonds, advancements, mobs, travel (km), deaths, blocks, fish, damage (hearts), netherite (ancient debris mined), experience (xp gained; a lower bound, since vanilla keeps no lifetime total), tamed (animals tamed; also a lower bound). Or any statistic as `category:key`, such as `custom:jump`, `mined:diamond_ore`, `killed:*`. Without statistics, the presets with their units, and everyone's statistics added up: hours played, blocks mined and the top block, mobs killed and the top mob, deaths, advancements, world day.",
    scope: "players:read",
    effect: "read",
    input: {
      statistics: z
        .array(z.string().min(1))
        .min(1)
        .max(5)
        .optional()
        .describe('Such as ["playtime", "mined:diamond_ore"]'),
      limit: z.number().int().min(1).max(500).optional().describe("Players per board; 10 by default"),
    },
    run: async (args) => {
      if (!args.statistics) {
        const [presets, totals] = await Promise.all([
          unwrap(api.GET("/leaderboards"), token),
          unwrap(api.GET("/aggregates"), token),
        ]);
        return { presets, totals };
      }
      const boards = await Promise.all(
        args.statistics.map((statistic) =>
          unwrap(
            api.GET("/leaderboards/{statistic}", {
              params: { path: { statistic }, query: { limit: args.limit ?? 10 } },
            }),
            token,
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
      "How to make an item (`item`) or what an item is good for (`uses`), or both: crafting grids with their shape, furnace, smoker, blast furnace, and campfire cooking with time and experience, stonecutting, and smithing. Plugin recipes count too. Each ingredient lists the items that fit.",
    scope: "server:read",
    effect: "read",
    input: {
      item: z.string().min(1).optional().describe("What the recipe makes, such as `minecraft:torch`"),
      uses: z.string().min(1).optional().describe("What the recipe takes, such as `minecraft:coal`"),
      limit,
      cursor,
    },
    run: (args) => {
      if (!args.item && !args.uses) throw new Error("Give item, uses, or both");
      return unwrap(api.GET("/recipes", { params: { query: { ...args, limit: args.limit ?? 20 } } }), token);
    },
  });
}
