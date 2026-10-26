# Changelog

## 4.1.1

- 📦 **Dependencies.** The MCP SDK moves to 1.32.2, with its fixes for transport types and for registering tools after the server connects.

## 4.1.0

minecraft-mcp works with WorldAPI's new Fabric and NeoForge mods, on a dedicated server and in the world you play alone. It needs WorldAPI 4.2.0; with an older one, the server warns at start.

- 🎮 **Singleplayer without setup.** Leave out `WORLDAPI_URL`, and minecraft-mcp finds the singleplayer world open on this computer with the WorldAPI mod, its address and token included. It looks again on every call, so it follows you from world to world, and while no world is open, tools answer `no_world` with a hint to open one. `WORLDAPI_LOCAL_DIR` points it at another folder than `~/.worldapi/local`.
- 👀 **What you're looking at.** `get_player` takes `target` in `include`: the block and the entity in a player's line of sight, and where their eyes are.
- 🧭 **It knows where it runs.** `get_server_status` shows WorldAPI's `platform`, `side`, `lan`, `cheats`, and `paused`. On the mods the agent learns that worlds are `overworld`, `the_nether`, and `the_end`, and in singleplayer that you are the world's owner and the player it talks about.
- 📜 **No scripts where they don't run.** On Fabric and NeoForge the four Java script tools stay out of the list, since WorldAPI runs scripts on Paper only.
- 📦 **The address is optional** in the Claude Desktop bundle and the MCP Registry entry, for singleplayer.

## 4.0.1

- 🔒 **Operators need the console.** WorldAPI 4.1.1 makes `server:console`, not `players:moderate`, the permission for making or unmaking operators, since an operator may run every command, `/worldapi` among them. `manage_access` says so, and with a token that lacks `server:console` it refuses `operators` before calling WorldAPI. Its other parts keep working for moderators.

## 4.0.0

Fewer, stronger tools: 46 instead of 73, and 17 instead of 29 for a `viewer` token. Related tools became one, and most take several targets at once, so the agent reads fewer schemas and makes fewer calls. It needs WorldAPI 4.1.0, which serves the command catalog; with an older one, the server warns at start.

- 🔎 **The server's commands.** `search_commands` searches every command the server has, the game's, the server's, and each plugin's, Brigadier ones included: its aliases, the plugin that owns it, its description, and its usage, several words at once, or one plugin's list. It needs WorldAPI's new `commands:read` (the `moderator` group has it) or `server:console`.
- ⌨️ **Several commands in one call.** `run_command` takes `commands` and runs them in order, each with its output. Its description now says plainly that the console changes the world like an operator would.
- 🧱 **Batches.** `get_block` reads up to 16 positions, and leaves out `y` for the column's surface. `set_blocks` places up to 64 blocks or fills a box. `get_player` reads up to 10 players. `send_message`, `set_advancement`, and `get_leaderboard` take lists too.
- 🎒 **One tool for items.** `edit_items` gives, sets, takes (new: some items from a slot), or clears items in a player's inventory, ender chest, or a container block.
- 🌍 **One tool to change a world.** `set_world` sets the time, weather, difficulty, PvP, game rules, the border, the world's own spawn, and the server's respawn point in one call, and answers only with what it could change, not every game rule.
- 🛡️ **One tool for access.** `manage_access` changes the whitelist, operators, bans, and pardons, and kicks players.
- `list_tokens` adds the groups and every permission with `groups`. `restart_server` tells whether a restart is pending with `action: "status"`.

### Breaking changes and migration

Tools were renamed or folded into others. The wiki's [Tools](https://github.com/MairwunNx/minecraft-mcp/wiki/Tools#tools-from-before-40) page has the whole table; in short:

- `get_system`: `get_server_status` with `include: ["host"]`; its `detail` is now `include: ["performance"]`.
- `get_chat`: `get_events` with `types: ["player.chat"]`.
- `list_worlds`, `get_spawn`: `get_world` without `world`, and with `include: ["respawn"]`; `ruleDetails` and `size` are `include: ["rules", "size"]`.
- `set_spawn`, `set_gamerule`, `set_world_border`: `set_world` with `respawn`, `rules`, and `border`.
- `get_biome`, `get_highest_block`: `get_block` with `positions`.
- `get_chunk`: `list_chunks` with `chunk`. `get_entity`: `list_entities` with `uuid`. `list_online_players`: `list_players` with `online: true`.
- `set_block`, `fill_blocks`: `set_blocks`.
- `give_item`, `edit_inventory`, `edit_container`: `edit_items`.
- `get_player_statistics`, `get_player_advancements`, `check_permission`: `get_player` with `statistics`, `advancements`, and `permission`.
- `get_aggregates`: `get_leaderboard` without `statistics`, which now takes a list instead of `statistic`.
- `broadcast`: `send_message` without `players`; `send_message` takes `players` instead of `player`.
- `manage_whitelist`, `set_operator`, `manage_bans`, `kick_player`: `manage_access`.
- `stop_server`: `restart_server` with `action: "stop"`; `cancel: true` is `action: "cancel"`.
- `list_configs`: `list_files` with `configs: true`.
- `set_config_values`, `write_file`: `edit_file` with `values` or `content`; its single `oldText` and `newText` are now `edits`.
- `get_java_script`: `list_java_scripts` with `id`.
- `run_command` takes `commands`, a list, instead of `command`. `set_advancement` takes `keys` instead of `key`.

## 3.1.1

A security release.

### Security

- 🔒 **No DNS rebinding on loopback HTTP.** With `--http` on 127.0.0.1 and no `MCP_HTTP_TOKEN`, a web page could point its own domain at your machine and call every tool with your WorldAPI token. The server now answers only requests whose `Host` and `Origin` name this machine; others get 403. With `MCP_HTTP_TOKEN` nothing changes.
- 🔒 **The game-data fence holds.** Text inside it can no longer close or open it with another spelling of the tag, such as `</GAME-DATA>` or `</ game-data >`.
- 🔒 **More text is fenced as data.** `get_audit_log` (anyone on the internet picks the name of a failed panel sign-in), `get_access` (ban reasons), `list_plugins` and `get_server_status` (descriptions from plugin and data pack authors), `get_recipes`, and `get_player_advancements` now come fenced, so the agent reads that text as data, not instructions.
- 📦 body-parser, fast-uri, and ip-address, which the MCP SDK pulls in, moved past their published advisories.

## 3.1.0

- 📍 **The spawn point.** `get_spawn` tells where players join and respawn without a bed, with the respawn radius and spawn protection; `set_spawn` moves it, to another world too. `set_world` now says its `spawn` is that world's own point for teleports. Needs WorldAPI 3.3.0, which the server now expects.

## 3.0.1

- The agent learns what its token can’t do. When a token lacks a permission, such as `players:write` for chat messages, the server’s instructions say so and name the group that would, so the agent tells the user instead of searching for a tool that isn’t there.
- The MCP Registry entry keeps its description under the registry’s 100 characters.

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
