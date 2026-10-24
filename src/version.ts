import { readFileSync } from "node:fs";
import type { WorldApi } from "./client.js";

/** This package's version, read from package.json so a release changes it in one place. */
export const VERSION: string = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
).version;

/** The oldest WorldAPI whose endpoints match the generated client. */
export const MIN_WORLDAPI = "4.1.0";

/** Compares two x.y.z versions; anything that isn't one (a dev build) counts as new enough. */
export function olderThan(version: string, minimum: string): boolean {
  const parse = (text: string) => /^(\d+)\.(\d+)\.(\d+)/.exec(text)?.slice(1).map(Number);
  const have = parse(version);
  const need = parse(minimum);
  if (!have || !need) return false;
  for (let i = 0; i < 3; i++) {
    if (have[i] !== need[i]) return (have[i] ?? 0) < (need[i] ?? 0);
  }
  return false;
}

/**
 * Asks WorldAPI for its version and warns when it's older than this server expects. It never
 * stops the start: most tools still work, and the warning says which side to update.
 */
export async function checkWorldApi(api: WorldApi, log: (line: string) => void): Promise<string | undefined> {
  try {
    const { data } = await api.GET("/server");
    const version = data?.worldApiVersion;
    if (version && olderThan(version, MIN_WORLDAPI))
      log(
        `WorldAPI ${version} is older than ${MIN_WORLDAPI}, which this server expects; update the plugin, or some tools will fail`,
      );
    return version;
  } catch {
    return undefined;
  }
}
