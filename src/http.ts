/** Names a browser uses for this machine; a page on another name that reaches the port came by DNS rebinding. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostname(host: string): string {
  // "[::1]:3333" keeps its brackets; "localhost:3333" drops the port.
  return (host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : (host.split(":")[0] ?? "")).toLowerCase();
}

/**
 * Whether a request to a loopback server without MCP_HTTP_TOKEN comes from this machine's own
 * clients. A web page can point its own domain at 127.0.0.1 and call the port as if it were
 * the same site; its requests then carry that domain in Host and Origin, so both must name
 * the loopback.
 */
export function fromLoopback(host: string | undefined, origin: string | undefined): boolean {
  if (!host || !LOOPBACK.has(hostname(host))) return false;
  if (origin === undefined) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && LOOPBACK.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
