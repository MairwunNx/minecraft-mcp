import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";
import { segment } from "./common.js";

const SCRIPTS =
  "Java run inside the server: arbitrary code, allowed by scripts.enabled in WorldAPI's config. Only Java and the Paper API (plus Adventure, Guava, Brigadier, JOML) are visible. Process, file, reflection, and class-loading calls fail to compile.";

export function scriptTools(ctx: Context): void {
  const { api } = ctx;

  tool(ctx, {
    name: "execute_java",
    untrusted: true,
    title: "Run Java once",
    description: `${SCRIPTS} Send a public class implementing \`com.mairwunnx.worldapi.script.api.WorldApiScript\` (\`Object run(ScriptContext ctx)\`), or just run's body, with \`ctx\` and \`server\` in scope and org.bukkit.* (with entity, block, and inventory), java.util.*, and java.util.stream.* imported. Return maps, lists, or primitives to get JSON: \`return server.getOnlinePlayers().stream().map(Player::getName).toList();\`. Thread \`main\` may touch the world but blocks the tick. \`async\` reaches the world through \`ctx.sync(callable)\`. \`ctx.log(String)\` writes to its log. The script unloads when it returns.`,
    scope: "code",
    effect: "destructive",
    input: {
      source: z.string().min(1).describe("Java class or run body"),
      thread: z.enum(["main", "async"]).default("main"),
    },
    run: (args) => unwrap(api.POST("/scripts/run", { body: args }), ctx.token),
  });

  tool(ctx, {
    name: "load_java_script",
    title: "Load a Java script",
    description: `${SCRIPTS} Loads a resident public class implementing \`com.mairwunnx.worldapi.script.api.WorldApiScript\`: \`void enable(ScriptContext ctx)\` runs once on the server thread, \`void disable()\` on unload. Register through ctx, never Bukkit, so unload removes it: \`on(EventClass.class, e -> …)\`, \`on(type, priority, ignoreCancelled, handler)\`, \`later(ticks, task)\`, \`every(delay, period, task)\`, \`async(task)\`, \`sync(callable)\`. Also \`server()\`, \`log(String)\`, \`memory()\`.`,
    scope: "code",
    effect: "destructive",
    input: {
      id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
      source: z.string().min(1).describe("Java class"),
      persistent: z.boolean().default(false).describe("Survives restarts"),
      replace: z.boolean().default(false).describe("Swaps a script with this id"),
    },
    run: (args) => unwrap(api.POST("/scripts", { body: args }), ctx.token),
  });

  tool(ctx, {
    name: "list_java_scripts",
    untrusted: true,
    title: "Loaded scripts",
    description:
      "Resident scripts with their listener, task, and error counts. With id, that script with its source and, unless logs is false, the latest lines it wrote with ctx.log and its errors.",
    scope: "code",
    effect: "read",
    input: {
      id: segment.optional(),
      logs: z.boolean().default(true),
      limit: z.number().int().min(1).max(10000).optional().describe("Log lines"),
    },
    run: async (args) => {
      if (!args.id) return unwrap(api.GET("/scripts"), ctx.token);
      const path = { id: args.id };
      const [script, logs] = await Promise.all([
        unwrap(api.GET("/scripts/{id}", { params: { path } }), ctx.token),
        args.logs
          ? unwrap(api.GET("/scripts/{id}/logs", { params: { path, query: { limit: args.limit } } }), ctx.token)
          : undefined,
      ]);
      return logs ? { script, logs } : { script };
    },
  });

  tool(ctx, {
    name: "unload_java_script",
    title: "Unload a script",
    description:
      "Run the script's disable(), remove its listeners and tasks, and close its class loader. A persistent script's saved copy goes too, unless keepSaved: then it loads again on the next start.",
    scope: "code",
    effect: "destructive",
    input: {
      id: segment,
      keepSaved: z.boolean().optional(),
    },
    run: (args) =>
      unwrap(
        api.DELETE("/scripts/{id}", { params: { path: { id: args.id }, query: { keepSaved: args.keepSaved } } }),
        ctx.token,
      ),
  });
}
