import { z } from "zod";
import { unwrap } from "../client.js";
import { type Context, tool } from "../tool.js";

const API = [
  "Scripts are Java, compiled and run inside the Minecraft server. This is arbitrary code: it needs the token's `code` scope and scripts.enabled in WorldAPI's config.",
  "Only Java and the Paper/Bukkit API are visible (plus Adventure, Guava, Brigadier, JOML); process, file, reflection, and class-loading calls are blocked at compile time.",
  "Interface: `com.mairwunnx.worldapi.script.api.WorldApiScript` with `Object run(ScriptContext ctx)`, `void enable(ScriptContext ctx)`, `void disable()`.",
  "ScriptContext: `server()`, `log(String)`, `on(EventClass.class, e -> …)`, `on(type, priority, ignoreCancelled, handler)`, `later(ticks, task)`, `every(delay, period, task)`, `async(task)`, `sync(callable)`, `memory()`.",
].join(" ");

export function scriptTools(ctx: Context): void {
  const { api, token } = ctx;

  tool(ctx, {
    name: "execute_java",
    untrusted: true,
    title: "Run Java once",
    description: `${API} Send either a full public class implementing WorldApiScript, or just the body of run: \`ctx\` and \`server\` are in scope, and org.bukkit.*, org.bukkit.entity.*, org.bukkit.block.*, org.bukkit.inventory.*, java.util.*, and java.util.stream.* are imported. End with \`return <value>;\`: maps, lists, and primitives come back as JSON. Example: \`return server.getOnlinePlayers().stream().map(Player::getName).toList();\`. thread \`main\` (default) may touch the world but blocks the tick while it runs; \`async\` runs beside the server and must use ctx.sync(...) for world access. The script unloads as soon as it returns, with anything it registered.`,
    scope: "code",
    effect: "destructive",
    input: { source: z.string().min(1), thread: z.enum(["main", "async"]).default("main") },
    run: (args) => unwrap(api.POST("/scripts/run", { body: args }), token),
  });

  tool(ctx, {
    name: "load_java_script",
    title: "Load a Java script",
    description: `${API} Loads a resident script: a full public class implementing WorldApiScript whose enable(ctx) runs once on the server thread. Register listeners with ctx.on(...) and tasks with ctx.later/every/async — only those are removed on unload, so never register through Bukkit directly. persistent keeps it across restarts; replace swaps a script with the same id.`,
    scope: "code",
    effect: "destructive",
    input: {
      id: z
        .string()
        .regex(/^[a-z0-9_-]{1,40}$/)
        .describe("Lowercase letters, digits, dashes, underscores"),
      source: z.string().min(1),
      persistent: z.boolean().default(false),
      replace: z.boolean().default(false),
    },
    run: (args) => unwrap(api.POST("/scripts", { body: args }), token),
  });

  tool(ctx, {
    name: "list_java_scripts",
    title: "Loaded scripts",
    description: "Resident scripts with their listener and task counts and error count.",
    scope: "code",
    effect: "read",
    input: {},
    run: () => unwrap(api.GET("/scripts"), token),
  });

  tool(ctx, {
    name: "get_java_script",
    title: "Script",
    description: "One resident script with its source.",
    scope: "code",
    effect: "read",
    input: { id: z.string() },
    run: (args) => unwrap(api.GET("/scripts/{id}", { params: { path: { id: args.id } } }), token),
  });

  tool(ctx, {
    name: "get_java_script_logs",
    untrusted: true,
    title: "Script log",
    description: "The latest lines a script wrote with ctx.log, plus errors from its handlers and tasks.",
    scope: "code",
    effect: "read",
    input: { id: z.string(), limit: z.number().int().min(1).max(10000).optional() },
    run: (args) =>
      unwrap(api.GET("/scripts/{id}/logs", { params: { path: { id: args.id }, query: { limit: args.limit } } }), token),
  });

  tool(ctx, {
    name: "unload_java_script",
    title: "Unload a script",
    description:
      "Run the script's disable(), remove its listeners and tasks, and close its class loader. A persistent script's saved copy is deleted too, unless keepSaved is true; then it loads again on the next server start.",
    scope: "code",
    effect: "destructive",
    input: { id: z.string(), keepSaved: z.boolean().optional() },
    run: (args) =>
      unwrap(
        api.DELETE("/scripts/{id}", { params: { path: { id: args.id }, query: { keepSaved: args.keepSaved } } }),
        token,
      ),
  });
}
