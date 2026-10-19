import type { Config } from "./config.js";
import { webSocketUrl } from "./scopes.js";

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
 * don't count: only something that happens after the call does.
 */
export function waitForEvent(config: Pick<Config, "url" | "token">, wait: EventWait): Promise<WaitResult> {
  return new Promise<WaitResult>((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl(config.url));
    let skipped: string[] | undefined;
    let done = false;
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
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
    const subscribe = (available: string[]) => {
      const topics = wait.types.filter((type) => available.includes(type));
      const missing = wait.types.filter((type) => !available.includes(type));
      if (missing.length > 0) skipped = missing;
      if (topics.length === 0) {
        finish(() =>
          reject(
            new Error(`None of ${wait.types.join(", ")} is open to this token; it may follow ${available.join(", ")}`),
          ),
        );
        return;
      }
      const filter = wait.player || wait.world ? { player: wait.player, world: wait.world } : undefined;
      socket.send(JSON.stringify({ op: "subscribe", topics, ...(filter && { filter }) }));
    };
    socket.addEventListener("message", (message) => {
      const frame = JSON.parse(String(message.data)) as {
        op: string;
        topic?: string;
        event?: StreamedEvent;
        topics?: string[];
        error?: { message?: string };
      };
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

/**
 * Keeps the latest events from WorldAPI's WebSocket in memory, reconnecting with backoff.
 * Topics the token may not see are skipped by the server, so the buffer only holds allowed ones.
 */
export class EventFeed {
  private readonly events: StreamedEvent[] = [];
  private readonly console: StreamedEvent[] = [];
  private socket: WebSocket | undefined;
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
    const socket = new WebSocket(webSocketUrl(this.config.url));
    this.socket = socket;
    socket.addEventListener("message", (message) => {
      const frame = JSON.parse(String(message.data)) as { op: string; event?: StreamedEvent; topics?: string[] };
      if (frame.op === "hello") {
        if (this.config.token) socket.send(JSON.stringify({ op: "auth", token: this.config.token }));
        else this.subscribe(frame.topics ?? []);
      } else if (frame.op === "authenticated") {
        this.subscribe(frame.topics ?? []);
      } else if (frame.op === "subscribed") {
        this.connected = true;
        this.delay = 1000;
      } else if (frame.op === "event" && frame.event) {
        const buffer = frame.event.type === CONSOLE_TOPIC ? this.console : this.events;
        buffer.unshift(frame.event);
        buffer.length = Math.min(buffer.length, this.size);
        this.onEvent();
      }
    });
    socket.addEventListener("close", () => {
      this.connected = false;
      if (this.stopped) return;
      setTimeout(() => this.start(), this.delay).unref();
      this.delay = Math.min(this.delay * 2, 60_000);
    });
    socket.addEventListener("error", () => socket.close());
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
    this.socket?.close();
  }
}
