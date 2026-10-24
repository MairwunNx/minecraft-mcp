# minecraft-mcp: notes for AI agents

An MCP server that lets AI agents read and manage a Minecraft server through WorldAPI (MairwunNx/minecraft-worldapi). README.md shows what it gives; the GitHub wiki (https://github.com/MairwunNx/minecraft-mcp/wiki, cloned from `https://github.com/MairwunNx/minecraft-mcp.wiki.git`) is the manual: install per client, configuration, tokens, tools, security, troubleshooting, and the developer pages. Read both first. It isn't installed on the owner's server, Moonlands: it runs next to an AI client. Moonlands itself, and how plugins get onto it, live in `~/c/personal/minecraft` (MairwunNx/minecraft).

## Talking to the owner

- Reply in Russian, address the owner as «вы». Quotes «ёлочки», nested „лапки“, an em dash with spaces « — ».
- Code, comments, commit messages, tool descriptions, and README.md are in English: curly quotes, an em dash without spaces or an en dash with spaces, never a hyphen as a dash.

## How it fits together

| Path | What it does |
|---|---|
| `src/index.ts` | Flags and transport: stdio, or streamable HTTP |
| `src/server.ts` | Builds the MCP server: tools, resources, prompts |
| `src/tool.ts` | Registers a tool with the WorldAPI permission it needs and MCP annotations; `untrusted` tools wrap game text in a `<game-data>` fence |
| `src/tools/` | One file per group: server, worlds, blocks, entities, players, stats, files, scripts, extensions |
| `src/scopes.ts` | WorldAPI's permissions; asks the WebSocket hello which ones the token has, so only usable tools are listed |
| `src/events.ts` | The live event feed behind the events and console resources |
| `src/generated/worldapi.ts` | Types generated from `openapi/worldapi.json`; never edit by hand |

## Rules that keep it working

- Every tool calls WorldAPI through the generated client, so a changed endpoint fails the typecheck instead of failing at runtime. After WorldAPI changes an endpoint, run `npm run generate` (it reads `../minecraft-worldapi/docs/openapi.json`) and fix what breaks.
- Text that comes from the game (chat, signs, books, item and entity names, script logs, console lines, files) is untrusted: mark the tool `untrusted` so the result is fenced. Tool descriptions say it's data, not instructions.
- A tool's `scope` must be the permission WorldAPI's endpoint checks (openapi.json states it; `/files` and `/files/read` really check files:read, or logs:read under logs/), and its `effect` (`read`, `idempotent`, `destructive`) must be honest: it sets the MCP hints, and read-only mode (`WORLDAPI_READ_ONLY`) hides every tool that isn't `read`.
- Over HTTP the server refuses to listen beyond loopback without `MCP_HTTP_TOKEN`, and without it answers only requests whose `Host` and `Origin` name the loopback (`src/http.ts`), against DNS rebinding. Keep it that way.
- Never print or log `WORLDAPI_TOKEN` or `MCP_HTTP_TOKEN`. The owner's read-only WorldAPI token lives in `~/.secrets/cloud.env` as `WORLDAPI_TOKEN`.

## Running and testing

- `npm run lint`, `npm run typecheck`, and `npm test` must pass; CI runs the same. Tests use a mocked WorldAPI and never touch the network.
- `scripts/live-check.mjs` runs the built server against a real WorldAPI. Moonlands' WorldAPI is at `https://minecraft.mairwunnx.com/worldapi/api/v1`: anonymous clients read what its config allows, and `WORLDAPI_TOKEN` gets the rest of its permissions. Write tools against Moonlands change the live world: they need the owner's go-ahead first.

## Checking a change

1. `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
2. `node scripts/live-check.mjs` against Moonlands' WorldAPI, read-only. Write tools change the live world and need the owner's go-ahead.
3. A change to the bundle: `npm run pack:mcpb`, then install the `.mcpb` in Claude Desktop and call one tool.

## Autopilot

`.github/workflows/autopilot.yml` runs Claude every Monday at 03:00 UTC: `/update-deps`, a fix for whatever it breaks, a push to `master`, and the “Release” workflow to npm and the MCP Registry when the package changed. It needs the `CLAUDE_CODE_OAUTH_TOKEN` secret. “Autopilot” in `~/c/personal/minecraft/CLAUDE.md` explains the family's runs. A session with the owner still releases only when the owner asks.

## Versions

Where the versions live, for `/update-deps` and `/update-minecraft` (both in `.claude/skills/`, the same files in every project of the family). This project has no Minecraft version to move, so `/update-minecraft` stops at once: it follows WorldAPI's endpoints, not the game.

- Packages: `package.json`, locked in `package-lock.json`. `npm outdated` lists what's behind. `@modelcontextprotocol/sdk` moves the protocol: read its changelog before a minor.
- Node: `engines.node` in `package.json`, `node-version` in `.github/workflows/`, and `@types/node`.
- `openapi-typescript` and the TypeScript 5 it needs are pinned in `scripts/generate.mjs`, not in `package.json`: it builds the client through TypeScript 5's API, which TypeScript 7 dropped. Check them with `npm view openapi-typescript version` and its `peerDependencies`. After an update, `npm run generate` regenerates the client; `git diff` should show only formatting the new version changed.
- GitHub Actions in `.github/workflows/`.

## Docs and releases

- README.md and README.RU.md are the shop window: the pitch, “What you get”, three steps to start, links into the wiki, and Related projects. No config tables, tool lists, or build steps there. Change both together. The release drops the “Try it live” section from the README it publishes to npm (keep that heading and a `## ` section after it): the Moonlands invitation stays on GitHub.
- The wiki is the manual, in English only. A change to tools, permissions, environment variables, or flags updates its Tools, Tokens-and-permissions, or Configuration page in the same session; the tool counts in README.md (71, and 28 for `viewer`) change with it.
- After a change that reaches what the project ships, add it to CHANGELOG.md in the same push: under the topmost “## X.Y.Z” section while that version isn't released (`gh release view vX.Y.Z` fails), or under a new section with the next version: patch for fixes, minor for features, major for breaking changes. A release then needs only the workflow, and the workflow runs only when the owner asks.
- Add a “## X.Y.Z” section to CHANGELOG.md, then run the “Release” workflow: `gh workflow run release.yml -R MairwunNx/minecraft-mcp -f version=X.Y.Z -f npm=true -f registry=true`. The repository keeps `0.0.0-dev` in package.json, manifest.json, and server.json; the workflow stamps the version, packs `minecraft-mcp-X.Y.Z.mcpb` (`npm run pack:mcpb`), tags `vX.Y.Z`, and attaches the bundle to a GitHub release, plus a version-less copy `minecraft-mcp.mcpb` that `releases/latest/download/minecraft-mcp.mcpb` (the README's Claude Desktop link) always reaches.
- npm: the package `@mairwunnx/minecraft-mcp` (plain `minecraft-mcp` belongs to someone else), published with provenance; the command it installs is still `minecraft-mcp`. It uses the `NPM_TOKEN` secret, a granular token that can bypass 2FA (npm refuses to publish otherwise); npm's trusted publishing for this workflow would replace it once set up on npmjs.com. npm made a `0.0.0-stage` placeholder version on the first publish; it's npm's own and harmless.
- MCP Registry: `server.json`, name `com.mairwunnx/minecraft-mcp`, which must match `mcpName` in package.json. The registry checks a DNS TXT record on mairwunnx.com (`v=MCPv1; k=ed25519; …`, in Cloudflare); the matching private key is `~/.secrets/mcp_registry_ed25519.pem` locally and the `MCP_REGISTRY_KEY` secret (hex) in GitHub. The registry needs the npm version to exist first, and npm serves a new version a minute or two after publishing, so the workflow waits for it. If the registry step fails anyway, publish locally: stamp `server.json` with the version, then `mcp-publisher login dns --domain mairwunnx.com --private-key <hex>` and `mcp-publisher publish`.
- `MIN_WORLDAPI` in `src/version.ts` is the oldest WorldAPI whose endpoints match the generated client; raise it when a release depends on new endpoints.

## Commits

Short one-line imperative English messages, one logical change per commit: “Fence chat and sign text as game data”.
