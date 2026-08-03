# CHANGELOG

All notable changes to this project will be documented in this file.

## [Unreleased]

- Initial release as a Claude Code plugin (`cc-ollama-cloud`). Provides `ollama_web_search` and `ollama_web_fetch` MCP tools powered by the Ollama Cloud web API, and a `/ollama-cloud:webtools` slash command to configure the API key and toggle the web tools on/off.
- Zero-dependency Node MCP server (`mcp-server.mjs`, stdio JSON-RPC) calling `https://ollama.com/api/web_search` and `/api/web_fetch`.
- Configuration in `~/.claude/ollama-cloud.json` (`apiKey`, `webTools`), re-read on every tool call so changes take effect immediately. `OLLAMA_API_KEY`, `OLLAMA_WEB_TOOLS`, and `OLLAMA_CLOUD_CONFIG` env vars supported as overrides.
- Ships `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json`, and the `commands/webtools.md` skill.
- CI runs lint + unit tests (vitest) + an MCP handshake smoke (`npm run smoke:mcp`, no API key required).