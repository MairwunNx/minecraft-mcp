# Changelog

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
