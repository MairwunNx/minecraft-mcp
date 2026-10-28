# minecraft-mcp

[![npm](https://img.shields.io/npm/v/@mairwunnx/minecraft-mcp?logo=npm&label=npm&color=CB3837)](https://www.npmjs.com/package/@mairwunnx/minecraft-mcp) [![MCP Registry](https://img.shields.io/badge/MCP_Registry-com.mairwunnx%2Fminecraft--mcp-6E56CF)](https://registry.modelcontextprotocol.io/?q=com.mairwunnx/minecraft-mcp) [![Glama](https://glama.ai/mcp/servers/MairwunNx/minecraft-mcp/badges/score.svg)](https://glama.ai/mcp/servers/MairwunNx/minecraft-mcp) [![Release](https://img.shields.io/github/v/release/MairwunNx/minecraft-mcp?label=release)](https://github.com/MairwunNx/minecraft-mcp/releases/latest)

🤖 **minecraft-mcp** даёт ИИ-агенту видеть ваш Minecraft-сервер и управлять им. Спросите Claude «кто онлайн и где они?», «почему сервер лагает?» или «раздай всем хлеб и сделай утро» — и он ответит по живым данным из вашего мира.

Он работает рядом с вашим ИИ-клиентом — Claude Desktop, Claude Code, Cursor, VS Code или любым другим, который понимает MCP, — и говорит с [WorldAPI](https://github.com/MairwunNx/minecraft-worldapi) на сервере Paper, Fabric или NeoForge или в мире, где вы играете в одиночку. Что агенту можно, решает токен, который вы ему дадите.

[English version](https://github.com/MairwunNx/minecraft-mcp/blob/master/README.md)

## Что вы получите

- 🧰 **51 инструмент** для сервера, миров, блоков, сундуков, сущностей, игроков, команд, рейтингов, рецептов, конфигов, логов и Java-скриптов. Большинство принимает сразу несколько целей, поэтому агент делает меньше вызовов.
- 🎒 **Инвентари в подробностях**: чары, прочность и эффекты каждого предмета, а ещё то, что лежит в шалкерах и мешках.
- 📜 **Конфиги и логи**: агент читает консоль и любой конфиг, а с подходящим токеном меняет значение и сохраняет комментарии.
- 🔑 **Только то, что позволяет токен**: с токеном `viewer` агент видит 19 инструментов, которые только смотрят, а режим «только чтение» прячет всё, что меняет сервер.
- 🎮 **Одиночная игра без настройки**: с модом WorldAPI в игре minecraft-mcp сам находит открытый мир и переходит за вами из мира в мир. Спросите «на что я смотрю?» прямо во время игры.
- 🙋 **«Я» — это вы**: укажите свой ник, и вопрос «где я?» просто сработает.
- ⏳ **Живые события**: «скажи, когда Стив зайдёт».
- 📣 **Discord и Telegram одной фразой**: «присылай смерти в мой Discord» или «пиши о входах в Telegram по-русски», и агент подключит их через вебхуки WorldAPI. Slack, Teams и Google Chat тоже.
- ↩️ **Отмена**: агент смотрит на постройку, прежде чем менять её, и вернёт как было, если результат не понравится.
- 🧭 **Настройка не встанет**: если не хватает адреса, токена или самого WorldAPI, агент скажет, в чём дело и как это исправить в игре или в админке.
- 🛡️ **Безопасность с самого начала**: текст из игры помечен как данные, инструменты предупреждают, когда что-то разрушают, а токен никуда не утекает.
- 🔌 **Любой клиент**: Claude Desktop в один клик или любой MCP-клиент через stdio или HTTP.

## Как начать

1. Поставьте [WorldAPI](https://github.com/MairwunNx/minecraft-worldapi) 4.2.0 или новее на сервер Paper, Fabric или NeoForge и создайте токен командой `/worldapi token create agent`. Играете один? Положите мод WorldAPI в игру, и адрес с токеном не понадобятся: `claude mcp add minecraft -- npx -y @mairwunnx/minecraft-mcp`. Остальное — на странице [Singleplayer](https://github.com/MairwunNx/minecraft-mcp/wiki/Singleplayer).
2. Добавьте minecraft-mcp в клиент. В Claude Desktop откройте [minecraft-mcp.mcpb](https://github.com/MairwunNx/minecraft-mcp/releases/latest/download/minecraft-mcp.mcpb). В Claude Code:

   ```sh
   claude mcp add minecraft -e WORLDAPI_URL=http://localhost:8110/api/v1 -e WORLDAPI_TOKEN=your-token -- npx -y @mairwunnx/minecraft-mcp
   ```

3. Спросите «как дела у сервера?». Cursor, VS Code и HTTP — на странице [Installation](https://github.com/MairwunNx/minecraft-mcp/wiki/Installation) в вики (на английском).

## Попробуйте вживую

Moonlands — мой хардкорный сервер с друзьями — работает на WorldAPI и открыт для чтения всем. Направьте агента туда без токена:

```sh
claude mcp add moonlands -e WORLDAPI_URL=https://minecraft.mairwunnx.com/worldapi/api/v1 -- npx -y @mairwunnx/minecraft-mcp
```

Потом спросите «кто больше всех играл на Moonlands на этой неделе?».

[![Играйте на Moonlands: чистая ваниль, сложные мобы, ИИ, приваты. ru.minecraft.mairwunnx.com](https://raw.githubusercontent.com/MairwunNx/minecraft-mcp/master/media/og-adv-image.ru.png)](https://minecraft.mairwunnx.com)

Адрес для игроков из России — `ru.minecraft.mairwunnx.com`, для остальных — `minecraft.mairwunnx.com`.

## Документация

Всё остальное — в [вики](https://github.com/MairwunNx/minecraft-mcp/wiki), на английском.

**Игрокам и владельцам серверов**

- [Installation](https://github.com/MairwunNx/minecraft-mcp/wiki/Installation), затем [Claude Desktop](https://github.com/MairwunNx/minecraft-mcp/wiki/Claude-Desktop), [Claude Code](https://github.com/MairwunNx/minecraft-mcp/wiki/Claude-Code), [Cursor](https://github.com/MairwunNx/minecraft-mcp/wiki/Cursor) или [Other clients](https://github.com/MairwunNx/minecraft-mcp/wiki/Other-clients)
- [Singleplayer](https://github.com/MairwunNx/minecraft-mcp/wiki/Singleplayer)
- [Configuration](https://github.com/MairwunNx/minecraft-mcp/wiki/Configuration)
- [Tokens and permissions](https://github.com/MairwunNx/minecraft-mcp/wiki/Tokens-and-permissions)
- [Tools](https://github.com/MairwunNx/minecraft-mcp/wiki/Tools)
- [Example prompts](https://github.com/MairwunNx/minecraft-mcp/wiki/Example-prompts)
- [Security](https://github.com/MairwunNx/minecraft-mcp/wiki/Security)
- [Troubleshooting](https://github.com/MairwunNx/minecraft-mcp/wiki/Troubleshooting)

**Разработчикам**

- [Building from source](https://github.com/MairwunNx/minecraft-mcp/wiki/Building-from-source)
- [Architecture](https://github.com/MairwunNx/minecraft-mcp/wiki/Architecture)
- [Development](https://github.com/MairwunNx/minecraft-mcp/wiki/Development)
- [Releasing](https://github.com/MairwunNx/minecraft-mcp/wiki/Releasing)

## Связанные проекты

- **[Moonlands](https://minecraft.mairwunnx.com)** — хардкорный сервер, на котором всё это работает.
- **[WorldAPI](https://github.com/MairwunNx/minecraft-worldapi)** — REST и WebSocket API к миру, игрокам и статистике сервера на Paper, Fabric или NeoForge.
- **[Allay](https://github.com/allay-ai/minecraft)** — ИИ-помощник в игре: спрашивайте командой `/ask` прямо в чате.
- **[Allay Server](https://github.com/allay-ai/server)** — бэкенд Allay.
- **[Mo’Joins](https://github.com/MairwunNx/mojoins)** — сообщения о входе и выходе на языке каждого игрока.
- **[Mo’Afks](https://github.com/MairwunNx/moafks)** — безопасный AFK-режим, который не мешает пропустить ночь.
- **[Mo’Bosses](https://github.com/MairwunNx/mobosses)** — монстры, которые появляются боссами с классами, способностями и добычей.
- **[minecraft-exporter](https://github.com/MairwunNx/minecraft-exporter)** — метрики Prometheus из WorldAPI.
- **[minecraft-grafana](https://github.com/MairwunNx/minecraft-grafana)** — дашборд Grafana для WorldAPI.

> 🫡 Сделал Павел Ерохин (Pavel Erokhin), он же mairwunnx.
