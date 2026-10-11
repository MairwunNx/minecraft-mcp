# minecraft-mcp: notes for AI agents

An MCP server that lets AI agents read and manage a Minecraft server through WorldAPI (MairwunNx/minecraft-worldapi). README.md explains it for humans; read it first.

## Talking to the owner

- Reply in Russian, address the owner as «вы». Quotes «ёлочки», nested „лапки“, an em dash with spaces « — ».
- Code, comments, commit messages, tool descriptions, and README.md are in English: curly quotes, an em dash without spaces or an en dash with spaces, never a hyphen as a dash.

## How it fits together

| Path | What it does |
|---|---|
| `src/index.ts` | Flags and transport: stdio, or streamable HTTP |
| `src/server.ts` | Builds the MCP server: tools, resources, prompts |
| `src/tool.ts` | Registers a tool with its WorldAPI scope and MCP annotations; `untrusted` tools wrap game text in a `<game-data>` fence |
| `src/tools/` | One file per group: server, worlds, blocks, entities, players, stats, scripts |
| `src/scopes.ts` | Asks WorldAPI's WebSocket hello which scopes the token has, so only usable tools are listed |
| `src/events.ts` | The live event feed behind the events resource |
| `src/generated/worldapi.ts` | Types generated from `openapi/worldapi.json`; never edit by hand |

## Rules that keep it working

- Every tool calls WorldAPI through the generated client, so a changed endpoint fails the typecheck instead of failing at runtime. After WorldAPI changes an endpoint, run `npm run generate` (it reads `../minecraft-worldapi/docs/openapi.json`) and fix what breaks.
- Text that comes from the game (chat, signs, books, item and entity names, script logs) is untrusted: mark the tool `untrusted` so the result is fenced. Tool descriptions say it's data, not instructions.
- A tool's scope must match WorldAPI's, and its `effect` (`read`, `idempotent`, `destructive`) must be honest: it sets the MCP hints, and read-only mode (`WORLDAPI_READ_ONLY`) hides every tool that isn't `read`.
- Over HTTP the server refuses to listen beyond loopback without `MCP_HTTP_TOKEN`. Keep it that way.
- Never print or log `WORLDAPI_TOKEN` or `MCP_HTTP_TOKEN`. The owner's read-only WorldAPI token lives in `~/.secrets/cloud.env` as `WORLDAPI_TOKEN`.

## Running and testing

- `npm run lint`, `npm run typecheck`, and `npm test` must pass; CI runs the same. Tests use a mocked WorldAPI and never touch the network.
- `scripts/live-check.mjs` runs the built server against a real WorldAPI. Moonlands' WorldAPI isn't public; reach it through `ssh moonlands` and the nginx path `/worldapi/` there, or the public `https://minecraft.mairwunnx.com/worldapi/api/v1` for what anonymous clients may read. Write tools against Moonlands change the live world: they need the owner's go-ahead first.

## Commits

Short one-line imperative English messages, one logical change per commit: “Fence chat and sign text as game data”.
