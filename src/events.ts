import type { Config } from "./config.js";
import { findLocalWorld } from "./local.js";
import { parseFrame, webSocketUrl } from "./scopes.js";

/** Topics the event history records; the resource follows the same ones live. */
export const RECORDED_TOPICS = [
  "player.join",
  "player.leave",
  "player.kick",
  "player.death",
  "player.advancement",
  "player.chat",
  "world.night_skipped",
  "entity.boss_killed",
  "raid.start",
  "raid.finish",
  "server.status",
];

/** Console lines stream on their own topic (logs:read) and keep a buffer of their own, so they don't push events out. */
export const CONSOLE_TOPIC = "server.console";

export interface StreamedEvent {
  type: string;
  at: string;
  player?: { uuid: string; name?: string };
  world?: string;
  data: Record<string, unknown>;
}

export interface EventWait {
  types: string[];
  player?: string | undefined;
  world?: string | undefined;
  timeoutMs: number;
}

export type WaitResult =
  | { event: StreamedEvent; topic: string; skipped?: string[] }
  | { timedOut: true; waitedSeconds: number; skipped?: string[] };

/**
 * Opens a WebSocket of its own, subscribes to [wait.types] (narrowed to a player or world on the
 * server side), and settles with the first event, or with a timeout. Snapshots of state topics
 * don't count: only something that happens after the call does. Aborting [signal] closes the
 * socket and rejects with "Cancelled".
 */
export function waitForEvent(
  config: Pick<Config, "url" | "token">,
  wait: EventWait,
  signal?: AbortSignal,
): Promise<WaitResult> {
  return new Promise<WaitResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Cancelled"));
      return;
    }
    const socket = new WebSocket(webSocketUrl(config.url));
    let skipped: string[] | undefined;
    let done = false;
    const cancel = () => finish(() => reject(new Error("Cancelled")));
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      socket.close();
      settle();
    };
    const timer = setTimeout(
      () =>
        finish(() =>
          resolve({ timedOut: true, waitedSeconds: Math.round(wait.timeoutMs / 1000), ...(skipped && { skipped }) }),
        ),
      wait.timeoutMs,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    const subscribe = (available: string[]) => {
      const topics = wait.types.filter((type) => available.includes(type));
      const missing = wait.types.filter((type) => !available.includes(type));
      if (missing.length > 0) skipped = missing;
      if (topics.length === 0) {
        finish(() =>
          reject(
            new Error(`None of ${wait.types.join(", ")} is open to this token. It may follow ${available.join(", ")}`),
          ),
        );
        return;
      }
      const filter = wait.player || wait.world ? { player: wait.player, world: wait.world } : undefined;
      socket.send(JSON.stringify({ op: "subscribe", topics, ...(filter && { filter }) }));
    };
    socket.addEventListener("message", (message) => {
      const frame = parseFrame<{
        op?: unknown;
        topic?: string;
        event?: StreamedEvent;
        topics?: string[];
        error?: { message?: string };
      }>(message.data);
      if (!frame) return;
      if (frame.op === "hello") {
        if (config.token) socket.send(JSON.stringify({ op: "auth", token: config.token }));
        else subscribe(frame.topics ?? []);
      } else if (frame.op === "authenticated") {
        subscribe(frame.topics ?? []);
      } else if (frame.op === "event" && frame.event) {
        const event = frame.event;
        finish(() => resolve({ event, topic: frame.topic ?? event.type, ...(skipped && { skipped }) }));
      } else if (frame.op === "error") {
        finish(() => reject(new Error(frame.error?.message ?? "WorldAPI refused the subscription")));
      }
    });
    socket.addEventListener("close", () => finish(() => reject(new Error("WorldAPI closed the connection"))));
    socket.addEventListener("error", () => finish(() => reject(new Error("Can't reach WorldAPI's WebSocket"))));
  });
}

/** How often the feed looks for a singleplayer world while none is open: a file lookup is cheap. */
const WORLD_CHECK_MS = 5000;

/**
 * Keeps the latest events from WorldAPI's WebSocket in memory, reconnecting with backoff.
 * Topics the token may not see are skipped by the server, so the buffer only holds allowed ones.
 */
export class EventFeed {
  private readonly events: StreamedEvent[] = [];
  private readonly console: StreamedEvent[] = [];
  private socket: WebSocket | undefined;
  private timer: NodeJS.Timeout | undefined;
  /** The address the buffers came from: another world's events don't belong to this one. */
  private address: string | undefined;
  private stopped = false;
  private delay = 1000;
  connected = false;

  constructor(
    private readonly config: Config,
    private readonly onEvent: () => void = () => {},
    private readonly size = 100,
  ) {}

  start(): void {
    if (this.stopped) return;
    const target = this.target();
    if (!target) {
      // No world is open: nothing listens for us yet, and a stranger on the default port mustn't get a token.
      this.retry(Math.min(this.delay, WORLD_CHECK_MS));
      this.delay = Math.min(this.delay * 2, WORLD_CHECK_MS);
      return;
    }
    if (this.address !== undefined && this.address !== target.url) {
      this.events.length = 0;
      this.console.length = 0;
      this.onEvent();
    }
    this.address = target.url;
    const socket = new WebSocket(webSocketUrl(target.url));
    this.socket = socket;
    socket.addEventListener("message", (message) => {
      const frame = parseFrame<{ op?: unknown; event?: StreamedEvent; topics?: string[] }>(message.data);
      if (!frame) return;
      if (frame.op === "hello") {
        if (target.token) socket.send(JSON.stringify({ op: "auth", token: target.token }));
        else this.subscribe(frame.topics ?? []);
      } else if (frame.op === "authenticated") {
        this.subscribe(frame.topics ?? []);
      } else if (frame.op === "subscribed") {
        this.connected = true;
        this.delay = 1000;
      } else if (frame.op === "event" && frame.event && typeof frame.event.type === "string") {
        const buffer = frame.event.type === CONSOLE_TOPIC ? this.console : this.events;
        buffer.unshift(frame.event);
        buffer.length = Math.min(buffer.length, this.size);
        this.onEvent();
      }
    });
    socket.addEventListener("close", () => {
      this.connected = false;
      if (this.stopped) return;
      this.retry(this.delay);
      this.delay = Math.min(this.delay * 2, 60_000);
    });
    socket.addEventListener("error", () => socket.close());
  }

  /**
   * Where to connect, with the token for that address. A local config reads both from one
   * discovery file, so the token never goes to an address it wasn't written for.
   */
  private target(): { url: string; token: string | undefined } | undefined {
    if (!this.config.local) return { url: this.config.url, token: this.config.token };
    const world = findLocalWorld(this.config.local.folder);
    return world && { url: world.url.replace(/\/+$/, ""), token: world.token };
  }

  private retry(delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.start(), delay).unref();
  }

  private subscribe(available: string[]): void {
    const topics = [...RECORDED_TOPICS, CONSOLE_TOPIC].filter((topic) => available.includes(topic));
    if (topics.length > 0) this.socket?.send(JSON.stringify({ op: "subscribe", topics }));
  }

  recent(): StreamedEvent[] {
    return [...this.events];
  }

  /** Console lines seen live, newest first. */
  consoleLines(): StreamedEvent[] {
    return [...this.console];
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.socket?.close();
  }
}
