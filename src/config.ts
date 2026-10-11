/** Settings from the environment. The token stays in memory and never reaches a log or a tool result. */
export interface Config {
  /** WorldAPI base URL including the base path, such as http://localhost:8110/api/v1. */
  url: string;
  token: string | undefined;
  readOnly: boolean;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  const url = env.WORLDAPI_URL?.trim();
  if (!url) throw new Error("Set WORLDAPI_URL to the WorldAPI base URL, such as http://localhost:8110/api/v1");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`WORLDAPI_URL isn't a URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error("WORLDAPI_URL must use http or https");
  return {
    url: url.replace(/\/+$/, ""),
    token: env.WORLDAPI_TOKEN?.trim() || undefined,
    readOnly: ["1", "true", "yes"].includes((env.WORLDAPI_READ_ONLY ?? "").toLowerCase()),
  };
}

/** Replaces every occurrence of the token, for anything that might end up in a message. */
export function redact(text: string, token: string | undefined): string {
  return token ? text.split(token).join("[token]") : text;
}
