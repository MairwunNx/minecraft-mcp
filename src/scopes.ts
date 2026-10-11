import { type Config, redact } from "./config.js";

export type Scope = "read" | "write:world" | "write:players" | "admin" | "code";

/** admin includes every scope except code, as in WorldAPI. */
export function grants(scopes: ReadonlySet<Scope>, needed: Scope): boolean {
  return scopes.has(needed) || (needed !== "code" && scopes.has("admin"));
}

export function webSocketUrl(base: string): string {
  return `${base.replace(/^http/, "ws")}/ws`;
}

/**
 * Asks WorldAPI which scopes the token has. The WebSocket greets every client with its scopes;
 * the token goes in the first message, never in the URL. Without a token, the answer is what
 * anonymous clients get.
 */
export async function discoverScopes(
  config: Config,
  log: (line: string) => void,
  timeoutMs = 10_000,
): Promise<Set<Scope>> {
  try {
    return await new Promise<Set<Scope>>((resolve, reject) => {
      const socket = new WebSocket(webSocketUrl(config.url));
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("no answer"));
      }, timeoutMs);
      const finish = (scopes: string[]) => {
        clearTimeout(timer);
        socket.close();
        resolve(new Set(scopes as Scope[]));
      };
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as {
          op: string;
          scopes?: string[];
          error?: { message: string };
        };
        if (message.op === "hello") {
          if (!config.token) finish(message.scopes ?? []);
          else socket.send(JSON.stringify({ op: "auth", token: config.token }));
        } else if (message.op === "authenticated") {
          finish(message.scopes ?? []);
        } else if (message.op === "error") {
          clearTimeout(timer);
          socket.close();
          reject(new Error(message.error?.message ?? "rejected"));
        }
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("can't connect"));
      });
    });
  } catch (error) {
    log(
      redact(
        `Couldn't read the token's scopes over the WebSocket (${(error as Error).message}); assuming read only`,
        config.token,
      ),
    );
    return new Set(["read"]);
  }
}
