import { z } from "zod";
import { unwrap } from "../client.js";
import { grants } from "../scopes.js";
import { type Context, tool } from "../tool.js";
import { int, item, SLOT_LAYOUT, segment } from "./common.js";

export function itemTools(ctx: Context): void {
  const { api } = ctx;

  tool(ctx, {
    name: "edit_items",
    title: "Give, take, or clear items",
    description: `Change a player's inventory or ender chest (players:write, online), or a container block (world:write). \`give\` adds an item where it fits: a player's overflow drops at their feet, a block's is lost (\`dropped\`). \`set\` replaces a slot, \`take\` removes amount from one, \`clear_slot\` empties one, and \`clear\` empties all, armor included. ${SLOT_LAYOUT} A double chest has 54, left half first.`,
    scope: { any: ["players:write", "world:write"] },
    effect: "destructive",
    input: {
      action: z.enum(["give", "set", "take", "clear_slot", "clear"]),
      player: segment
        .optional()
        .describe(
          `Player name or UUID${ctx.player ? `, ${ctx.player} (the user) when neither player nor block is given` : ""}`,
        ),
      container: z.enum(["inventory", "enderchest"]).default("inventory").describe("For a player"),
      block: z
        .object({ world: segment.default("world"), x: int(), y: int(), z: int() })
        .optional()
        .describe("Instead of a player"),
      slot: z.number().int().min(0).max(255).optional(),
      item: item.optional().describe("Give `type` or a full `item`"),
      amount: z.number().int().min(1).max(6400).optional().describe("For take: the whole stack when left out"),
    },
    run: (args) => {
      const needSlot = () => {
        if (args.slot === undefined) throw new Error(`${args.action} needs slot`);
        return args.slot;
      };
      const needItem = () => {
        if (!args.item) throw new Error(`${args.action} needs item`);
        return args.item;
      };
      const take = { amount: args.amount ?? 6400 };
      if (args.block) {
        // Read at call time: the token's permissions can change while the server runs.
        if (!grants(ctx.scopes, "world:write")) throw new Error("Changing a container block needs world:write");
        const { world, x, y, z: bz } = args.block;
        const at = { params: { path: { world, x, y, z: bz } } };
        const slot = (n: number) => ({ params: { path: { world, x, y, z: bz, slot: n } } });
        switch (args.action) {
          case "clear":
            return unwrap(api.DELETE("/worlds/{world}/blocks/{x}/{y}/{z}/container", at), ctx.token);
          case "give":
            return unwrap(
              api.POST("/worlds/{world}/blocks/{x}/{y}/{z}/container/give", { ...at, body: { item: needItem() } }),
              ctx.token,
            );
          case "clear_slot":
            return unwrap(
              api.DELETE("/worlds/{world}/blocks/{x}/{y}/{z}/container/slots/{slot}", slot(needSlot())),
              ctx.token,
            );
          case "take":
            return unwrap(
              api.POST("/worlds/{world}/blocks/{x}/{y}/{z}/container/slots/{slot}/take", {
                ...slot(needSlot()),
                body: take,
              }),
              ctx.token,
            );
          case "set":
            return unwrap(
              api.PATCH("/worlds/{world}/blocks/{x}/{y}/{z}/container/slots/{slot}", {
                ...slot(needSlot()),
                body: needItem(),
              }),
              ctx.token,
            );
        }
      }
      const name = args.player ?? ctx.player;
      if (!name) throw new Error("Give player or block");
      if (!grants(ctx.scopes, "players:write")) throw new Error("Changing a player's items needs players:write");
      const ender = args.container === "enderchest";
      const who = { params: { path: { player: name } } };
      const slot = (n: number) => ({ params: { path: { player: name, slot: n } } });
      switch (args.action) {
        case "clear":
          return unwrap(
            ender ? api.DELETE("/players/{player}/enderchest", who) : api.DELETE("/players/{player}/inventory", who),
            ctx.token,
          );
        case "give": {
          const body = { item: needItem() };
          return unwrap(
            ender
              ? api.POST("/players/{player}/enderchest/give", { ...who, body })
              : api.POST("/players/{player}/inventory/give", { ...who, body }),
            ctx.token,
          );
        }
        case "clear_slot": {
          const at = slot(needSlot());
          return unwrap(
            ender
              ? api.DELETE("/players/{player}/enderchest/slots/{slot}", at)
              : api.DELETE("/players/{player}/inventory/slots/{slot}", at),
            ctx.token,
          );
        }
        case "take": {
          const at = { ...slot(needSlot()), body: take };
          return unwrap(
            ender
              ? api.POST("/players/{player}/enderchest/slots/{slot}/take", at)
              : api.POST("/players/{player}/inventory/slots/{slot}/take", at),
            ctx.token,
          );
        }
        case "set": {
          const at = { ...slot(needSlot()), body: needItem() };
          return unwrap(
            ender
              ? api.PATCH("/players/{player}/enderchest/slots/{slot}", at)
              : api.PATCH("/players/{player}/inventory/slots/{slot}", at),
            ctx.token,
          );
        }
      }
    },
  });
}
