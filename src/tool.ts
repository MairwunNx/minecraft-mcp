import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { type WorldApi, WorldApiError } from "./client.js";
import { redact } from "./config.js";
import { grants, type Scope } from "./scopes.js";

/** How a tool affects the server; it decides the MCP annotations. */
export type Effect = "read" | "write" | "idempotent" | "destructive";

export interface ToolSpec<Shape extends z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  effect: Effect;
  input: Shape;
  run: (args: z.infer<z.ZodObject<Shape>>) => Promise<unknown>;
}

export interface Context {
  server: McpServer;
  api: WorldApi;
  scopes: ReadonlySet<Scope>;
  readOnly: boolean;
  token: string | undefined;
  /** Names of the tools this context registered, in order. */
  registered: string[];
}

/** Registers a tool if the token's scopes allow it and, for writes, read-only mode is off. */
export function tool<Shape extends z.ZodRawShape>(ctx: Context, spec: ToolSpec<Shape>): void {
  if (!grants(ctx.scopes, spec.scope)) return;
  if (spec.effect !== "read" && ctx.readOnly) return;
  ctx.registered.push(spec.name);
  ctx.server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.input,
      annotations: {
        title: spec.title,
        readOnlyHint: spec.effect === "read",
        destructiveHint: spec.effect === "destructive",
        idempotentHint: spec.effect === "read" || spec.effect === "idempotent",
        openWorldHint: false,
      },
    },
    // biome-ignore lint/suspicious/noExplicitAny: the SDK's callback type is generic over the shape.
    (async (args: any) => result(() => spec.run(args), ctx.token)) as any,
  );
}

/** Runs a tool body and turns its value or error into a compact MCP result. */
export async function result(body: () => Promise<unknown>, token: string | undefined): Promise<CallToolResult> {
  try {
    const value = await body();
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return { content: [{ type: "text", text: redact(text, token) }] };
  } catch (error) {
    const message =
      error instanceof WorldApiError
        ? `${error.code}: ${error.message}`
        : `error: ${(error as Error).message ?? String(error)}`;
    return { isError: true, content: [{ type: "text", text: redact(message, token) }] };
  }
}
