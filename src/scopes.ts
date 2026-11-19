import { type Config, redact } from "./config.js";
import { findLocalWorld } from "./local.js";

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
  "webhooks:manage",
  "code",
] as const;

export type Scope = (typeof PERMISSIONS)[number];

/** What a tool needs: one permission, every one of a list, any one of a list, or nothing at all. */
export type Need = Scope | { all: Scope[] } | { any: Scope[] } | "none";

/** What a singleplayer world's own token has: WorldAPI's admin group, everything but files:write and code. */
export const LOCAL: Scope[] = PERMISSIONS.filter((scope) => scope !== "files:write" && scope !== "code");

/** What anonymous clients may ever have, and the guess when the WebSocket doesn't answer. */
export const ANONYMOUS: Scope[] = ["server:read", "players:read", "events:read"];

export function grants(scopes: ReadonlySet<Scope>, needed: Need): boolean {
  if (needed === "none") return true;
  if (typeof needed === "string") return scopes.has(needed);
  if ("all" in needed) return needed.all.every((scope) => scopes.has(scope));
  return needed.any.some((scope) => scopes.has(scope));
}

export function webSocketUrl(base: string): string {
  return `${base.replace(/^http/, "ws")}/ws`;
}

/**
 * Reads one WebSocket frame as a JSON object, or undefined when it isn't one. A proxy's HTML
 * error page or a binary frame must not throw inside a listener, where nothing catches it and
 * the process dies.
 */
export function parseFrame<T extends { op?: unknown }>(data: unknown): T | undefined {
  if (typeof data !== "string") return undefined;
  try {
    const frame: unknown = JSON.parse(data);
    return typeof frame === "object" && frame !== null && !Array.isArray(frame) ? (frame as T) : undefined;
  } catch {
    return undefined;
  }
}

/** WorldAPI answered and refused the token: a real answer, unlike a server that can't be reached. */
export class TokenRejected extends Error {}

/**
 * Asks WorldAPI which permissions the token has. The WebSocket greets every client with them:
 * the token goes in the first message, never in the URL. Without a token, the answer is what
 * anonymous clients get. Throws TokenRejected when WorldAPI refuses the token, and a plain Error
 * when it can't be reached or doesn't answer.
 */
export function readScopes(config: Config, timeoutMs = 10_000): Promise<Set<Scope>> {
  return new Promise<Set<Scope>>((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl(config.url));
    const settle = (finish: () => void) => {
      clearTimeout(timer);
      socket.close();
      finish();
    };
    const timer = setTimeout(() => settle(() => reject(new Error("no answer"))), timeoutMs);
    socket.addEventListener("message", (event) => {
      const message = parseFrame<{
        op?: unknown;
        scopes?: string[];
        error?: { message: string };
      }>(event.data);
      if (!message) return;
      // Names this server doesn't know, such as 2.x scopes from an older WorldAPI, grant nothing.
      const known = () =>
        new Set(
          (message.scopes ?? []).filter((scope): scope is Scope => (PERMISSIONS as readonly string[]).includes(scope)),
        );
      if (message.op === "hello") {
        if (!config.token) settle(() => resolve(known()));
        else socket.send(JSON.stringify({ op: "auth", token: config.token }));
      } else if (message.op === "authenticated") {
        settle(() => resolve(known()));
      } else if (message.op === "error") {
        settle(() => reject(new TokenRejected(message.error?.message ?? "rejected")));
      }
    });
    // A socket that closes before it answers never connected as far as permissions go. A settled promise ignores both.
    socket.addEventListener("error", () => settle(() => reject(new Error("can't connect"))));
    socket.addEventListener("close", () => settle(() => reject(new Error("can't connect"))));
  });
}

/** Like readScopes, but falls back to what anonymous clients get when the answer is anything but a list. */
export async function discoverScopes(
  config: Config,
  log: (line: string) => void,
  timeoutMs = 10_000,
): Promise<Set<Scope>> {
  try {
    return await readScopes(config, timeoutMs);
  } catch (error) {
    log(
      redact(
        `Couldn't read the token's permissions over the WebSocket (${(error as Error).message}). Assuming what anonymous clients get`,
        config.token,
      ),
    );
    return new Set(ANONYMOUS);
  }
}

/** How often a running server asks again, so a token changed in WorldAPI's panel needs no restart. */
export const REFRESH_EVERY_MS = 5 * 60_000;

/** The least time between two refreshes that tool errors ask for. */
export const SUSPECT_GAP_MS = 10_000;

/**
 * The token's permissions while the server runs. Every MCP session (one on stdio, one per client over HTTP)
 * follows the same store: it switches its tools on and off when a listener hears of a change.
 */
export class Permissions {
  private current: Set<Scope>;
  private readonly listeners = new Set<(scopes: ReadonlySet<Scope>) => void>();
  private running: Promise<void> | undefined;
  private queued: Promise<void> | undefined;
  private lastRead = 0;
  private later: ReturnType<typeof setTimeout> | undefined;
  /** The singleplayer world last seen, as its address and token, kept in memory only. */
  private world: string | undefined;

  /**
   * Without a config the set never changes: tests hand in a set and change it themselves.
   * The set is kept as it is, not copied, until a refresh replaces it.
   */
  constructor(
    initial: Set<Scope>,
    private readonly config?: Config,
    private readonly log: (line: string) => void = () => {},
    private readonly gapMs = SUSPECT_GAP_MS,
    private readonly timeoutMs = 10_000,
  ) {
    this.current = initial;
    this.world = this.localWorld();
  }

  get scopes(): ReadonlySet<Scope> {
    return this.current;
  }

  /** Calls the listener after each change. The function it returns stops that. */
  subscribe(listener: (scopes: ReadonlySet<Scope>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Asks the WebSocket hello again. A server that can't be reached keeps the set it had, so a WorldAPI
   * restart doesn't flap the tools. A rejected token is a real answer: then only what anonymous clients get.
   */
  refresh(): Promise<void> {
    if (!this.running) {
      this.running = this.read().finally(() => {
        this.running = undefined;
      });
      return this.running;
    }
    // A change seen during a read may come after the hello it got: read once more after it, not once per caller.
    this.queued ??= this.running.then(() => {
      this.queued = undefined;
      return this.refresh();
    });
    return this.queued;
  }

  /** A call answered invalid_token, token_required, or missing_scope: refresh, at most once per gap. */
  suspect(): void {
    if (!this.config || this.later) return;
    const wait = this.lastRead + this.gapMs - Date.now();
    if (wait <= 0) {
      void this.refresh();
      return;
    }
    this.later = setTimeout(() => {
      this.later = undefined;
      void this.refresh();
    }, wait);
    this.later.unref?.();
  }

  /** In singleplayer, refreshes when the world open now isn't the one last seen: another save, or a new token. */
  checkWorld(): void {
    if (!this.config?.local) return;
    const world = this.localWorld();
    if (world === this.world) return;
    this.world = world;
    // With no world open the hello can't answer either: the next world brings its own.
    if (world !== undefined) void this.refresh();
  }

  /** Refreshes every so often until the returned function stops it. The timer doesn't keep the process alive. */
  start(everyMs = REFRESH_EVERY_MS): () => void {
    const timer = setInterval(() => void this.refresh(), everyMs);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  private localWorld(): string | undefined {
    const folder = this.config?.local?.folder;
    const world = folder === undefined ? undefined : findLocalWorld(folder);
    return world && `${world.url}\n${world.token}`;
  }

  private async read(): Promise<void> {
    // With no singleplayer world open, whatever listens on the default port isn't WorldAPI's to trust.
    if (!this.config || (this.config.local && this.localWorld() === undefined)) return;
    this.lastRead = Date.now();
    let next: Set<Scope>;
    try {
      next = await readScopes(this.config, this.timeoutMs);
    } catch (error) {
      if (!(error instanceof TokenRejected)) return;
      this.log(
        redact(`WorldAPI rejected the token (${error.message}). Only what anonymous clients get`, this.config.token),
      );
      next = new Set(ANONYMOUS);
    }
    if (next.size === this.current.size && [...next].every((scope) => this.current.has(scope))) return;
    this.current = next;
    this.log(`Permissions changed: ${[...next].join(", ") || "none"}`);
    for (const listener of this.listeners) listener(next);
  }
}

/** What each missing permission would let the agent do, so it can tell the user what to ask for. */
export const MISSING: [Scope, string][] = [
  [
    "players:write",
    "send chat messages, titles, or sounds (send_message), teleport players, or change their inventories and effects",
  ],
  ["world:write", "change time, weather, game rules, blocks, containers, or entities"],
  ["server:console", "run console commands"],
  ["server:control", "save, restart, or stop the server"],
  ["players:moderate", "kick, ban, whitelist, or op players"],
  ["chat:read", "read chat"],
  ["logs:read", "read the console or log files"],
  ["files:read", "read server and plugin configs"],
  ["files:write", "change configs"],
  ["webhooks:manage", "connect Discord, Slack, Telegram, Teams, or Google Chat through webhooks"],
];
