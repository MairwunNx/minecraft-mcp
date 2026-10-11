import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";

export function statsTools(ctx: Context): void {
  const { api, token } = ctx;

  tool(ctx, {
    name: "list_leaderboards",
    title: "Leaderboards",
    description: "The preset leaderboards and their units.",
    scope: "read",
    effect: "read",
    input: {},
    run: () => unwrap(api.GET("/leaderboards"), token),
  });

  tool(ctx, {
    name: "get_leaderboard",
    title: "Leaderboard",
    description:
      "Players ranked by a statistic; ties share a place. Presets: playtime (hours), diamonds, advancements, mobs, travel (km), deaths, blocks, fish, damage (hearts). Or any statistic as `category:key`, such as `custom:jump`, `mined:diamond_ore`, `killed:*`.",
    scope: "read",
    effect: "read",
    input: { statistic: z.string().min(1), limit: z.number().int().min(1).max(500).optional() },
    run: (args) =>
      unwrap(
        api.GET("/leaderboards/{statistic}", {
          params: { path: { statistic: args.statistic }, query: { limit: args.limit ?? 10 } },
        }),
        token,
      ),
  });

  tool(ctx, {
    name: "get_aggregates",
    title: "Server totals",
    description:
      "Everyone's statistics added up: hours played, blocks mined and the top block, mobs killed and the top mob, deaths, advancements, world day.",
    scope: "read",
    effect: "read",
    input: {},
    run: () => unwrap(api.GET("/aggregates"), token),
  });
}
