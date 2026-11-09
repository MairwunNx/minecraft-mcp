import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";

export function extensionTools(ctx: Context): void {
  const { api, token } = ctx;

  tool(ctx, {
    name: "list_extensions",
    title: "Plugins’ data",
    description:
      "Other plugins on the server that share their own data through WorldAPI: each one’s namespace, its resources (paths to read with `read_extension`, with the parameters each reads and the shape it answers with), its event topics (`ext.<namespace>.<event>`, which `get_events` and `wait_for_event` take like any type), and its actions (things to do with `call_extension`, with the permission and the body each needs). What’s here depends on the server; call this first instead of guessing.",
    scope: "server:read",
    effect: "read",
    untrusted: true,
    input: {},
    run: () => unwrap(api.GET("/extensions"), token),
  });

  tool(ctx, {
    name: "read_extension",
    title: "Read a plugin’s data",
    description:
      'One resource of a plugin from `list_extensions`, read from the plugin as it is now. Fill the path’s `{parameters}`, such as `players/Steve` for `players/{player}`; `query` passes the resource’s own options, such as `{ "limit": "5" }`.',
    scope: "server:read",
    effect: "read",
    untrusted: true,
    input: {
      namespace: z
        .string()
        .regex(/^[a-z0-9_-]{1,32}$/)
        .describe("The namespace, such as one `list_extensions` shows"),
      path: z.string().min(1).describe("The resource path with its parameters filled in"),
      query: z.record(z.string(), z.string()).optional().describe("The resource's own options"),
    },
    run: (args) => {
      // Each segment is encoded on its own, so the path's slashes stay slashes.
      const segments = args.path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
      const url = `/extensions/${args.namespace}/${segments}` as "/extensions/{namespace}/{path}";
      return unwrap(api.GET(url, { params: { query: args.query } } as never), token);
    },
  });

  tool(ctx, {
    name: "call_extension",
    title: "Do something through a plugin",
    description:
      'One action of a plugin from `list_extensions`: `post` does something, like spawning a plugin’s boss, and `delete` takes something away or ends it, like a player’s AFK. Fill the path’s `{parameters}`, such as `players/Steve/afk` for `players/{player}/afk`; `body` carries the fields a `post` action lists, with a place as `{ "world": "world", "x": 0, "y": 64, "z": 0 }`. Each action names the permission it needs, and WorldAPI records every call in its audit log.',
    scope: { any: ["world:write", "players:write", "players:moderate", "server:control", "server:console"] },
    effect: "write",
    untrusted: true,
    input: {
      namespace: z
        .string()
        .regex(/^[a-z0-9_-]{1,32}$/)
        .describe("The namespace, such as one `list_extensions` shows"),
      path: z.string().min(1).describe("The action's path with its parameters filled in"),
      method: z.enum(["post", "delete"]).describe("The action's method, as `list_extensions` shows it"),
      body: z.record(z.string(), z.unknown()).optional().describe("The fields a `post` action reads"),
      query: z.record(z.string(), z.string()).optional().describe("The query parameters a `delete` action reads"),
    },
    run: (args) => {
      // Each segment is encoded on its own, so the path's slashes stay slashes.
      const segments = args.path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
      const url = `/extensions/${args.namespace}/${segments}` as "/extensions/{namespace}/{path}";
      if (args.method === "delete") return unwrap(api.DELETE(url, { params: { query: args.query } } as never), token);
      return unwrap(api.POST(url, { params: { query: args.query }, body: args.body ?? {} } as never), token);
    },
  });
}
