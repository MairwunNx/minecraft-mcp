import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** What a singleplayer world with the WorldAPI mod writes for local clients while it's open. */
export interface LocalWorld {
  url: string;
  token: string;
  /** The save's name, as the game's world list shows it. */
  world: string;
  platform: string;
  version: string;
  pid: number;
  startedAt: string;
}

/** Where the mod writes them: `~/.worldapi/local/<port>.json`; WORLDAPI_LOCAL_DIR points elsewhere. */
export function localFolder(env: NodeJS.ProcessEnv = process.env): string {
  return env.WORLDAPI_LOCAL_DIR?.trim() || join(homedir(), ".worldapi", "local");
}

/** Whether a process still runs: a file a crashed game left behind names one that doesn't. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Another user's process answers EPERM: it exists.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Hosts a discovery file may name: a file is anyone's to write, so it must not send calls and the token off this machine. */
const LOOPBACK = new Set(["127.0.0.1", "[::1]", "localhost"]);

function loopbackUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return (url.protocol === "http:" || url.protocol === "https:") && LOOPBACK.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Whether a parsed file holds every field this server reads, with the right types. */
function valid(value: unknown): value is LocalWorld {
  if (typeof value !== "object" || value === null) return false;
  const world = value as Record<string, unknown>;
  return (
    typeof world.url === "string" &&
    loopbackUrl(world.url) &&
    typeof world.token === "string" &&
    typeof world.startedAt === "string" &&
    Number.isInteger(world.pid) &&
    (world.pid as number) > 0
  );
}

/** The world opened last of those still open, or undefined when the game isn't running one. */
export function findLocalWorld(folder: string = localFolder()): LocalWorld | undefined {
  let names: string[];
  try {
    names = readdirSync(folder).filter((name) => name.endsWith(".json"));
  } catch {
    return undefined;
  }
  const worlds: LocalWorld[] = [];
  for (const name of names) {
    try {
      const world: unknown = JSON.parse(readFileSync(join(folder, name), "utf8"));
      if (valid(world) && alive(world.pid)) worlds.push(world);
    } catch {
      // A file being written right now, or someone else's: skip it.
    }
  }
  return worlds.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

/** What tools answer while no world is open. */
export const NO_WORLD =
  "No Minecraft world with WorldAPI is open. Start the game and open a world with the WorldAPI mod (Fabric or NeoForge), or set WORLDAPI_URL to a server's WorldAPI.";
