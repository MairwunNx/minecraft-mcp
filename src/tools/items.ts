import { z } from "zod";
import { unwrap } from "../client.js";
import { grants } from "../scopes.js";
import { type Context, tool } from "../tool.js";
import { item, OFFLINE_NOTE, SLOT_LAYOUT } from "./common.js";

export function itemTools(ctx: Context): void {
  const { api, token } = ctx;
  const players = grants(ctx.scopes, "players:write");
  const blocks = grants(ctx.scopes, "world:write");

  tool(ctx, {
    name: "edit_items",
    title: "Give, take, or clear items",
    description: `Change what a player's inventory or ender chest holds (players:write; ${OFFLINE_NOTE}), or a chest, barrel, or other container block (world:write). Give either player (and container) or block. \`give\` adds an item where it fits: a player's overflow drops at their feet, a block's is lost and counted in \`dropped\`. \`set\` puts an item in a slot, replacing what was there. \`take\` removes amount items from a slot and says what it took. \`clear_slot\` empties one slot; \`clear\` empties everything, a player's armor and offhand included. Cleared and taken items are gone. ${SLOT_LAYOUT} A container's slots count from 0; a double chest has 54, the left half first.`,
    scope: { any: ["players:write", "world:write"] },
    effect: "destructive",
    input: {
      action: z.enum(["give", "set", "take", "clear_slot", "clear"]),
      player: z
        .string()
        .min(1)
        .optional()
        .describe(
          `Player name or UUID${ctx.player ? `; ${ctx.player}, the user, when neither player nor block is given` : ""}`,
        ),
      container: z.enum(["inventory", "enderchest"]).default("inventory").describe("For a player"),
      block: z
        .object({ world: z.string().default("world"), x: z.number().int(), y: z.number().int(), z: z.number().int() })
        .optional()
        .describe("A container block instead of a player"),
      slot: z.number().int().min(0).optional().describe("For set, take, and clear_slot"),
      item: item.optional().describe("For give and set"),
      amount: z.number().int().min(1).optional().describe("For take: how many; the whole stack when left out"),
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
        if (!blocks) throw new Error("Changing a container block needs world:write");
        const { world, x, y, z: bz } = args.block;
        const at = { params: { path: { world, x, y, z: bz } } };
        const slot = (n: number) => ({ params: { path: { world, x, y, z: bz, slot: n } } });
        switch (args.action) {
          case "clear":
            return unwrap(api.DELETE("/worlds/{world}/blocks/{x}/{y}/{z}/container", at), token);
          case "give":
            return unwrap(
              api.POST("/worlds/{world}/blocks/{x}/{y}/{z}/container/give", { ...at, body: { item: needItem() } }),
              token,
            );
          case "clear_slot":
            return unwrap(
              api.DELETE("/worlds/{world}/blocks/{x}/{y}/{z}/container/slots/{slot}", slot(needSlot())),
              token,
            );
          case "take":
            return unwrap(
              api.POST("/worlds/{world}/blocks/{x}/{y}/{z}/container/slots/{slot}/take", {
                ...slot(needSlot()),
                body: take,
              }),
              token,
            );
          case "set":
            return unwrap(
              api.PATCH("/worlds/{world}/blocks/{x}/{y}/{z}/container/slots/{slot}", {
                ...slot(needSlot()),
                body: needItem(),
              }),
              token,
            );
        }
      }
      const name = args.player ?? ctx.player;
      if (!name) throw new Error("Give player or block");
      if (!players) throw new Error("Changing a player's items needs players:write");
      const ender = args.container === "enderchest";
      const who = { params: { path: { player: name } } };
      const slot = (n: number) => ({ params: { path: { player: name, slot: n } } });
      switch (args.action) {
        case "clear":
          return unwrap(
            ender ? api.DELETE("/players/{player}/enderchest", who) : api.DELETE("/players/{player}/inventory", who),
            token,
          );
        case "give": {
          const body = { item: needItem() };
          return unwrap(
            ender
              ? api.POST("/players/{player}/enderchest/give", { ...who, body })
              : api.POST("/players/{player}/inventory/give", { ...who, body }),
            token,
          );
        }
        case "clear_slot": {
          const at = slot(needSlot());
          return unwrap(
            ender
              ? api.DELETE("/players/{player}/enderchest/slots/{slot}", at)
              : api.DELETE("/players/{player}/inventory/slots/{slot}", at),
            token,
          );
        }
        case "take": {
          const at = { ...slot(needSlot()), body: take };
          return unwrap(
            ender
              ? api.POST("/players/{player}/enderchest/slots/{slot}/take", at)
              : api.POST("/players/{player}/inventory/slots/{slot}/take", at),
            token,
          );
        }
        case "set": {
          const at = { ...slot(needSlot()), body: needItem() };
          return unwrap(
            ender
              ? api.PATCH("/players/{player}/enderchest/slots/{slot}", at)
              : api.PATCH("/players/{player}/inventory/slots/{slot}", at),
            token,
          );
        }
      }
    },
  });
}
