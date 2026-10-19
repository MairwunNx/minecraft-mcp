// Starts the built server over stdio against a real WorldAPI and calls a few tools.
//   WORLDAPI_URL=... WORLDAPI_TOKEN=... node scripts/live-check.mjs [tool] [json args]
// Without arguments it runs a read-only tour. The token is passed through, never printed.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: process.env,
  stderr: "inherit",
});
const client = new Client({ name: "live-check", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`${tools.length} tools: ${tools.map((tool) => tool.name).join(", ")}`);

const calls = process.argv[2]
  ? [[process.argv[2], JSON.parse(process.argv[3] ?? "{}")]]
  : [
      ["get_server_status", {}],
      ["list_worlds", {}],
      ["get_world", { world: "world" }],
      ["get_leaderboard", { statistic: "playtime" }],
      ["get_events", { limit: 3 }],
      ["get_entity_summary", { world: "world" }],
      ["locate", { kind: "structure", targets: ["village"], radius: 50 }],
    ];
for (const [name, args] of calls) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content.map((part) => part.text).join("");
  console.log(`\n${name}${result.isError ? " (error)" : ""}: ${text.length > 400 ? `${text.slice(0, 400)}…` : text}`);
}
const { resources } = await client.listResources();
console.log(`\nresources: ${resources.map((resource) => resource.uri).join(", ")}`);
const { prompts } = await client.listPrompts();
console.log(`prompts: ${prompts.map((prompt) => prompt.name).join(", ")}`);
await client.close();
