# minecraft-mcp: notes for AI agents

An MCP server that lets AI agents read and manage a Minecraft server through WorldAPI (MairwunNx/minecraft-worldapi). README.md explains it for humans; read it first. It isn't installed on the owner's server, Moonlands: it runs next to an AI client. Moonlands itself, and how plugins get onto it, live in `~/c/personal/minecraft` (MairwunNx/minecraft).

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
- `scripts/live-check.mjs` runs the built server against a real WorldAPI. Moonlands' WorldAPI is at `https://minecraft.mairwunnx.com/worldapi/api/v1`: anonymous clients read what its config allows, and `WORLDAPI_TOKEN` gets the rest of its scopes. Write tools against Moonlands change the live world: they need the owner's go-ahead first.

## Docs and releases

- README.md and README.RU.md are for people who use the server: who it's for, install, tools, safety. Change both together. The release drops the “Try it live” section from the README it publishes to npm: the Moonlands invitation stays on GitHub. Internals (the code map above, `scripts/live-check.mjs`) stay here.
- Add a “## X.Y.Z” section to CHANGELOG.md, then run the “Release” workflow: `gh workflow run release.yml -R MairwunNx/minecraft-mcp -f version=X.Y.Z -f npm=true -f registry=true`. The repository keeps `0.0.0-dev` in package.json, manifest.json, and server.json; the workflow stamps the version, packs `minecraft-mcp-X.Y.Z.mcpb` (`npm run pack:mcpb`), tags `vX.Y.Z`, and attaches the bundle to a GitHub release.
- npm: the package `@mairwunnx/minecraft-mcp` (plain `minecraft-mcp` belongs to someone else), published with provenance; the command it installs is still `minecraft-mcp`. It uses the `NPM_TOKEN` secret, a granular token that can bypass 2FA (npm refuses to publish otherwise); npm's trusted publishing for this workflow would replace it once set up on npmjs.com. npm made a `0.0.0-stage` placeholder version on the first publish; it's npm's own and harmless.
- MCP Registry: `server.json`, name `com.mairwunnx/minecraft-mcp`, which must match `mcpName` in package.json. The registry checks a DNS TXT record on mairwunnx.com (`v=MCPv1; k=ed25519; …`, in Cloudflare); the matching private key is `~/.secrets/mcp_registry_ed25519.pem` locally and the `MCP_REGISTRY_KEY` secret (hex) in GitHub. The registry needs the npm version to exist first, and npm serves a new version a minute or two after publishing, so the workflow waits for it. If the registry step fails anyway, publish locally: stamp `server.json` with the version, then `mcp-publisher login dns --domain mairwunnx.com --private-key <hex>` and `mcp-publisher publish`.
- `MIN_WORLDAPI` in `src/version.ts` is the oldest WorldAPI whose endpoints match the generated client; raise it when a release depends on new endpoints.

## Commits

Short one-line imperative English messages, one logical change per commit: “Fence chat and sign text as game data”.
