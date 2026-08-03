# cc-ollama-cloud

A [Claude Code](https://claude.com/claude-code) plugin that adds **web search** and **web fetch** tools powered by the [Ollama Cloud](https://ollama.com) web API — no local Ollama server required.

The plugin ships two MCP tools and one slash command:

| Component | Description |
|---|---|
| `ollama_web_search` | Search the web via Ollama Cloud's `/api/web_search`. Returns titles, URLs, and content snippets. |
| `ollama_web_fetch` | Fetch and extract text content from a URL via Ollama Cloud's `/api/web_fetch`. Returns page title, content, and links. |
| `/ollama-cloud:webtools` | Configure your Ollama Cloud API key and toggle the web tools on/off. |

## Prerequisites

- An [Ollama Cloud API key](https://ollama.com) (sign up and generate one at ollama.com).
- [Node.js](https://nodejs.org) 18+ available on your `PATH` (used to run the MCP server).

## Installation

### Option 1: from the marketplace (recommended for others)

Add this repo as a marketplace and install the plugin:

```
/plugin marketplace add Cyli00/cc-ollama-cloud
/plugin install ollama-cloud@cc-ollama-cloud
```

Then `/reload-plugins`.

### Option 2: load directly from a local directory (for development)

```bash
claude --plugin-dir /path/to/cc-ollama-cloud
```

Or clone into the skills-dir layout to auto-load it in future sessions:

```bash
git clone https://github.com/Cyli00/cc-ollama-cloud ~/.claude/skills/ollama-cloud
```

## Setup

1. **Install the plugin** (see above).
2. **Configure your API key** — run the slash command:

   ```
   /ollama-cloud:webtools
   ```

   Choose **Configure / replace API key** and paste your key. It is stored in
   `~/.claude/ollama-cloud.json`. (If you prefer not to write the key to disk, set the
   `OLLAMA_API_KEY` environment variable instead — the server reads it as a fallback.)

3. **Toggle the web tools** (optional) — the same command lets you enable/disable the
   tools. You can also pass an argument directly:

   ```
   /ollama-cloud:webtools off
   /ollama-cloud:webtools on
   /ollama-cloud:webtools key
   ```

The tools are available immediately after enabling — no plugin reload needed. The MCP
server re-reads the config file on every tool call, so config changes take effect at once.

## Configuration

All settings live in `~/.claude/ollama-cloud.json`:

```json
{
  "apiKey": "your-ollama-cloud-key",
  "webTools": true
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `apiKey` | string | — | Ollama Cloud API key. Falls back to the `OLLAMA_API_KEY` env var when absent. |
| `webTools` | boolean | `true` | Set to `false` to disable both web tools. |

Environment variable overrides (highest priority):

| Variable | Effect |
|---|---|
| `OLLAMA_API_KEY` | Provides the API key when `apiKey` is not set in the config file. |
| `OLLAMA_WEB_TOOLS` | Set to `0`/`false`/`no`/`off` to force-disable the web tools regardless of the config file. |
| `OLLAMA_CLOUD_CONFIG` | Points the server at a non-default config file path. |

## How it works

The plugin bundles a zero-dependency Node MCP server (`mcp-server.mjs`) that speaks the
MCP stdio JSON-RPC protocol. It exposes `ollama_web_search` and `ollama_web_fetch`, which
call `https://ollama.com/api/web_search` and `https://ollama.com/api/web_fetch`
respectively, authenticating with your API key.

The `/ollama-cloud:webtools` slash command is a skill that reads/writes the config file on
your behalf: it asks what you want to do (set key / enable / disable / view status) and
updates `~/.claude/ollama-cloud.json`. Because the server re-reads that file on each tool
call, the toggle and key changes are reflected immediately.

## Tool names in Claude Code

Plugin MCP tools are namespaced. In permissions, `allowed-tools`, and subagent `tools`
lists, the full names are:

- `mcp__plugin_ollama-cloud_ollama-cloud__ollama_web_search`
- `mcp__plugin_ollama-cloud_ollama-cloud__ollama_web_fetch`

## Development

```bash
npm install          # install devDependencies (biome, vitest)
npm run check        # lint + format with auto-fix
npm run lint         # lint only (no fixes)
npm run test         # unit tests (vitest)
npm run smoke:mcp    # stdio handshake smoke against mcp-server.mjs (no API key needed)
```

The project uses [Biome](https://biomejs.dev/) for linting/formatting (2-space indent,
line width 120). There is no build step — the plugin ships plain `.mjs` files.

### Layout

| Path | Role |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest. |
| `.mcp.json` | Registers the MCP server with Claude Code. |
| `commands/webtools.md` | The `/ollama-cloud:webtools` slash command (skill). |
| `mcp-server.mjs` | Zero-dependency stdio MCP server (JSON-RPC protocol layer). |
| `lib.mjs` | Tool logic: config loading, HTTP, response validation, formatting. |
| `test/lib.test.mjs` | Unit tests for `lib.mjs`. |
| `scripts/smoke-mcp.mjs` | MCP handshake smoke test. |

## License

MIT