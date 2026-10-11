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

export interface StreamedEvent {
  type: string;
  at: string;
  player?: { uuid: string; name?: string };
  world?: string;
  data: Record<string, unknown>;
}

/**
 * Keeps the latest events from WorldAPI's WebSocket in memory, reconnecting with backoff.
 * Topics the token may not see are skipped by the server, so the buffer only holds allowed ones.
 */
export class EventFeed {
  private readonly events: StreamedEvent[] = [];
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
        this.events.unshift(frame.event);
        this.events.length = Math.min(this.events.length, this.size);
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
    const topics = RECORDED_TOPICS.filter((topic) => available.includes(topic));
    if (topics.length > 0) this.socket?.send(JSON.stringify({ op: "subscribe", topics }));
  }

  recent(): StreamedEvent[] {
    return [...this.events];
  }

  stop(): void {
    this.stopped = true;
    this.socket?.close();
  }
}
