import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";

export function extensionTools(ctx: Context): void {
  const { api, token } = ctx;

  tool(ctx, {
    name: "list_extensions",
    title: "Plugins’ data",
    description:
      "Other plugins on the server that share their own data through WorldAPI: each one’s namespace, its resources (paths to read with `read_extension`), and its event topics (`ext.<namespace>.<event>`, which `get_events` and `wait_for_event` take like any type). What’s here depends on the server; call this first instead of guessing.",
    scope: "read",
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
    scope: "read",
    effect: "read",
    untrusted: true,
    input: {
      namespace: z
        .string()
        .regex(/^[a-z0-9_-]{1,32}$/)
        .describe("The namespace, such as one `list_extensions` shows"),
      path: z.string().min(1).describe("The resource path with its parameters filled in"),
      query: z.record(z.string(), z.string()).optional(),
    },
    run: (args) => {
      // Each segment is encoded on its own, so the path's slashes stay slashes.
      const segments = args.path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
      const url = `/extensions/${args.namespace}/${segments}` as "/extensions/{namespace}/{path}";
      return unwrap(api.GET(url, { params: { query: args.query } } as never), token);
    },
  });
}
