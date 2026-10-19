# Changelog

## 3.0.0

minecraft-mcp follows WorldAPI 3.0: permissions instead of scopes, configs and logs, containers, and one call for a whole player. It needs WorldAPI 3.0.0; with an older one, the server warns at start and many tools fail.

- **Permissions decide the tools.** WorldAPI 3.0 replaces the five scopes with permissions such as `server:read`, `players:private`, `logs:read`, and `files:write`, bundled into the groups `viewer`, `moderator`, `admin`, and `owner`. Each tool asks for the permission its endpoint checks, so a token sees exactly what it can use: a `viewer` token gets 28 tools that only look.
- **Configs and logs.** `list_configs`, `list_files`, and `read_file` read the server’s and plugins’ configs and the console logs: numbered lines a page at a time, the last lines, or grep with context, gzipped logs too. With `files:write`, `edit_file` replaces exact text, `set_config_values` sets keys by dotted path and keeps YAML comments, and `write_file` replaces a whole file. Writes take the sha256 `read_file` shows, so they fail if the file changed meanwhile. File text is fenced as game data.
- **A whole player in one call.** `get_player` takes `include`: inventory, ender chest, effects, deaths, sessions, statistics, and advancements.
- **Chests.** `get_block` shows a container’s slots, `find_containers` finds chests near a point that hold an item, and `edit_container` gives, sets, clears a slot, or empties a container.
- **Entities without the flood.** `get_entity_summary` counts entities by type and names the busiest chunks; `list_entities` pages by 25 and filters by name and chunk; `get_entity` adds villager trades, leashes, and spawn reasons.
- **More of the server.** `get_server_status` with `detail` adds the JVM (memory pools, garbage collection, threads) and lists data packs; `get_system` shows the host’s CPU, memory, disk, and container limits; `stop_server` stops with a countdown like `restart_server`; `get_chat` reads chat history; `list_tokens` and `get_audit_log` show WorldAPI’s tokens and what they changed.
- **Live console.** `wait_for_event` waits for `server.console` lines and `player.chat`, and the new `worldapi://server/console` resource keeps the newest console lines, for tokens with `logs:read`.
- `limit` 0 on paged lists answers only the total.
- Zod 4.6.7 inside, and built with TypeScript 7.
- The GitHub release also carries `minecraft-mcp.mcpb`, so [releases/latest/download/minecraft-mcp.mcpb](https://github.com/MairwunNx/minecraft-mcp/releases/latest/download/minecraft-mcp.mcpb) always downloads the newest Claude Desktop bundle.

### Breaking changes and migration

- **Tokens.** Old scope names don’t count any more: tools appear by WorldAPI 3 permissions. WorldAPI 3 keeps old tokens working by mapping `read` to its 2.x meaning, `write:world` to `world:write`, `write:players` to `players:write`, and `admin` to the `admin` group, so most tokens need nothing. `admin` no longer includes changing files: give `files:write` (or the `owner` group) on purpose.
- **Removed tools:**
  - `get_player_inventory`, `get_player_effects`, and `get_player_sessions`: use `get_player` with `include` `inventory`, `enderchest`, `effects`, or `sessions`; older sessions are `player.join` and `player.leave` in `get_events`.
  - `locate_structure` and `find_nearby`: use `locate` with `kind` `structure`, `biome`, or `block` and `targets`.
- **Changed permissions.** `get_server_log` needs `logs:read`, `run_command` needs `server:console`, `save_worlds` and `restart_server` need `server:control`, and the whitelist, operator, ban, and kick tools need `players:moderate`. `broadcast` moved to `players:write`.
- `list_entities` now returns 25 entities unless you ask for more.

## 2.2.0

- **Agents read what other plugins share.** WorldAPI 2.3.0 lets plugins share their own data, and two new tools reach it, whatever the server runs: `list_extensions` shows which plugins share what, and `read_extension` reads one of their resources, such as a plugin’s leaderboard or a player’s card. Their events come through `get_events` and `wait_for_event` like any other type.
- `get_leaderboard` knows the `tamed` preset of WorldAPI 2.4.0: animals each player has tamed.
- Needs WorldAPI 2.3.0 for those two; with an older one, the server warns at start and the rest works as before.

## 2.1.1

- The npm page no longer carries the Moonlands invitation; it stays on GitHub. Nothing else changed.

## 2.1.0

- **Agents see what an item really is.** `get_player_inventory`, `get_block`, and `get_entity` now explain the item detail WorldAPI 2.1.0 sends: enchantments stored in books, attack damage and armor attributes, potion and tipped arrow effects, armor trims, dye colors, anvil repair cost, book titles, fireworks, and what’s inside shulker boxes and bundles. Ask “which of my swords hits hardest?” or “what’s in the shulker in my ender chest?” and get a real answer.
- With WorldAPI 2.0.0 everything still works; the items just carry less.

## 2.0.0

minecraft-mcp goes public: MIT-licensed, on npm as `@mairwunnx/minecraft-mcp`, in the MCP Registry as `com.mairwunnx/minecraft-mcp`, and as a one-click bundle for Claude Desktop. It needs WorldAPI 2.0.0 and warns at start when the plugin is older.

- **Fewer, broader tools: 59 instead of 78.** Related actions share one tool, so agents pick faster:
  - `set_world` replaces `set_time`, `set_weather`, `set_difficulty`, `set_pvp`, and `set_world_spawn`.
  - `get_world` now carries the border, game rules, and size; `get_world_border` and `get_gamerules` are gone.
  - `manage_bans` replaces the four ban and pardon tools, and `get_access` reads the whitelist, operators, and bans at once.
  - `world_effect` replaces lightning, explosions, sounds, and particles.
  - `edit_inventory`, `set_effects`, and `set_advancement` replace their add, remove, and clear tools; `get_player_inventory` reads the ender chest too.
  - `get_server_status` takes `detail` instead of a separate `get_performance`; `get_leaderboard` lists the boards when no statistic is given; `get_java_script` shows the script’s log.
- **New tools:** `find_nearby` (blocks and biomes), `get_recipes`, `get_server_log`, `restart_server` with a countdown, and `wait_for_event` for live events. `remove_entity` clears many entities by type and area, and `list_chunks` sorts by load.
- **`WORLDAPI_PLAYER`** tells the agent who “I” and “me” are, and player tools default to that player.
- **New prompts:** `investigate_lag`, `investigate_grief`, and `new_player_guide`.

## 1.0.0

- The first version: tools for the server, worlds, blocks, entities, players, leaderboards, and Java scripts over WorldAPI, picked by the token’s scopes; resources and prompts; stdio and Streamable HTTP.
