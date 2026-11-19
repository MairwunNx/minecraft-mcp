import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import { isSegment } from "./common.js";

const namespace = z
  .string()
  .regex(/^[a-z0-9_-]{1,32}$/)
  .describe("As `list_extensions` shows it");

/** A resource or action path: every segment is a name, so "." and ".." can't climb out to another endpoint. */
const extensionPath = z
  .string()
  .min(1)
  .refine((path) => path.split("/").some(Boolean) && path.split("/").filter(Boolean).every(isSegment), {
    message: "Every part of the path is a name: “.” and “..” aren't allowed",
  });

/** The URL of one plugin path. Each segment is encoded on its own, so the path's slashes stay slashes. */
function extensionUrl(ns: string, path: string) {
  const segments = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `/extensions/${ns}/${segments}` as "/extensions/{namespace}/{path}";
}

export function extensionTools(ctx: Context): void {
  const { api } = ctx;

  tool(ctx, {
    name: "list_extensions",
    title: "Plugins’ data",
    description:
      "Plugins that share their own data through WorldAPI: each one’s namespace, its resources (for `read_extension`, with parameters and answer shape), its event topics (`ext.<namespace>.<event>` for `get_events` and `wait_for_event`), and its actions (for `call_extension`, with the permission and body each needs). Call this first instead of guessing.",
    scope: "server:read",
    effect: "read",
    untrusted: true,
    input: {},
    run: () => unwrap(api.GET("/extensions"), ctx.token),
  });

  tool(ctx, {
    name: "read_extension",
    title: "Read a plugin’s data",
    description:
      'One resource of a plugin from `list_extensions`, as it is now. Fill the path’s `{parameters}`: `players/Steve` for `players/{player}`. `query` passes the resource’s own options, such as `{ "limit": "5" }`.',
    scope: "server:read",
    effect: "read",
    untrusted: true,
    input: {
      namespace,
      path: extensionPath.describe("With its parameters filled in"),
      query: z.record(z.string(), z.string()).optional(),
    },
    run: (args) => {
      const url = extensionUrl(args.namespace, args.path);
      return unwrap(api.GET(url, { params: { query: args.query } } as never), ctx.token);
    },
  });

  tool(ctx, {
    name: "call_extension",
    title: "Do something through a plugin",
    description:
      'One action of a plugin from `list_extensions`: `post` does something, like spawning a boss, and `delete` takes something away, like a player’s AFK. Fill the path’s `{parameters}`: `players/Steve/afk`. `body` carries a `post` action’s fields, with a place as `{ "world": "world", "x": 0, "y": 64, "z": 0 }`.',
    scope: { any: ["world:write", "players:write", "players:moderate", "server:control", "server:console"] },
    effect: "destructive",
    untrusted: true,
    input: {
      namespace,
      path: extensionPath.describe("With its parameters filled in"),
      method: z.enum(["post", "delete"]),
      body: z.record(z.string(), z.unknown()).optional().describe("For `post`"),
      query: z.record(z.string(), z.string()).optional().describe("For `delete`"),
    },
    run: (args) => {
      const url = extensionUrl(args.namespace, args.path);
      if (args.method === "delete")
        return unwrap(api.DELETE(url, { params: { query: args.query } } as never), ctx.token);
      return unwrap(api.POST(url, { params: { query: args.query }, body: args.body ?? {} } as never), ctx.token);
    },
  });
}
