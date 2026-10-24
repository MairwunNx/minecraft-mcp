import { type Config, redact } from "./config.js";

/** WorldAPI's permissions. The WebSocket hello lists a token's own, with its groups resolved. */
export const PERMISSIONS = [
  "server:read",
  "players:read",
  "players:private",
  "events:read",
  "chat:read",
  "logs:read",
  "system:read",
  "world:write",
  "players:write",
  "players:moderate",
  "server:console",
  "commands:read",
  "server:control",
  "files:read",
  "files:write",
  "tokens:manage",
  "code",
] as const;

export type Scope = (typeof PERMISSIONS)[number];

/** What a tool needs: one permission, every one of a list, or any one of a list. */
export type Need = Scope | { all: Scope[] } | { any: Scope[] };

/** What anonymous clients may ever have; also the guess when the WebSocket doesn't answer. */
export const ANONYMOUS: Scope[] = ["server:read", "players:read", "events:read"];

export function grants(scopes: ReadonlySet<Scope>, needed: Need): boolean {
  if (typeof needed === "string") return scopes.has(needed);
  if ("all" in needed) return needed.all.every((scope) => scopes.has(scope));
  return needed.any.some((scope) => scopes.has(scope));
}

export function webSocketUrl(base: string): string {
  return `${base.replace(/^http/, "ws")}/ws`;
}

/**
 * Asks WorldAPI which permissions the token has. The WebSocket greets every client with them;
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
        // Names this server doesn't know, such as 2.x scopes from an older WorldAPI, grant nothing.
        resolve(new Set(scopes.filter((scope): scope is Scope => (PERMISSIONS as readonly string[]).includes(scope))));
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
        `Couldn't read the token's permissions over the WebSocket (${(error as Error).message}); assuming what anonymous clients get`,
        config.token,
      ),
    );
    return new Set(ANONYMOUS);
  }
}
