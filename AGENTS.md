# Development Rules

Canonical instructions for local coding agents. Claude Code does not read this file directly; add a `CLAUDE.md` importing `@AGENTS.md` if you want it to.

## Conversational Style

- Keep answers short and concise.
- No emojis in commits, issues, PR comments, or code.
- No fluff or cheerful filler text.
- Technical prose only, be direct.
- When the user asks a question, answer it first before making edits or running implementation commands.
- When responding to user feedback or an analysis, explicitly say whether you agree or disagree before saying what you changed.

## Code Quality

- Read files in full before wide-ranging changes, before editing files you have not fully inspected, and when asked to investigate or audit.
- No `any` unless absolutely necessary (this is plain JS, so prefer runtime guards + JSDoc typedefs).
- Inline single-line helpers that have only one call site.
- Do not preserve backward compatibility unless the user asks for it.

## Module Boundaries

This is a Claude Code plugin. The split is intentional, do not collapse it:

- `.claude-plugin/plugin.json` — Plugin manifest. Declares the MCP server (`./.mcp.json`) and the commands directory.
- `.claude-plugin/marketplace.json` — Marketplace catalog listing this plugin (github source `Cyli00/cc-ollama-cloud`). Lets others `/plugin marketplace add Cyli00/cc-ollama-cloud` then `/plugin install ollama-cloud@cc-ollama-cloud`.
- `.mcp.json` — Registers the `ollama-cloud` MCP server (`node ${CLAUDE_PLUGIN_ROOT}/mcp-server.mjs`) with Claude Code.
- `mcp-server.mjs` — MCP stdio server. Protocol layer only: JSON-RPC framing, `initialize`, `tools/list`, `tools/call`. No business logic here — delegate to `lib.mjs`.
- `lib.mjs` — Tool logic: config loading/saving, `fetchJsonWithTimeout`, response validation, formatting, error responses, and `executeWebSearch` / `executeWebFetch`. Pure functions, shared by the server and the tests. No external dependencies.
- `commands/webtools.md` — The `/ollama-cloud:webtools` slash command (skill). Reads/writes `~/.claude/ollama-cloud.json` via `Bash(node *)` + `Read` + `Write`.

## Configuration

- Config file: `~/.claude/ollama-cloud.json` (override path with `OLLAMA_CLOUD_CONFIG`). Schema: `{ apiKey?: string, webTools?: boolean }`.
- The MCP server re-reads this file on **every** `tools/call`. This is deliberate so the slash command's key/toggle changes take effect immediately, without a plugin reload. Do not cache config across calls.
- Env override precedence (highest first): `OLLAMA_WEB_TOOLS` (hard kill switch) > config file `webTools` > default `true`. `OLLAMA_API_KEY` is a fallback when `apiKey` is absent.
- `sanitizeConfig` drops unknown keys and type-mismatched values. Malformed config must not crash the server — `loadConfig` returns `{}` on parse failure.

## Error Handling

- `try/finally` is mandatory for every `setTimeout` and `AbortController`. Cleanup must run on the error path, not only the happy path. See `fetchJsonWithTimeout`.
- Validate `JSON.parse` results before use. When the consumer expects an object, guard against `null`, arrays, and primitives. See `loadConfig`.
- User-facing error messages should name the operation, the failure mode, and the next step. Do not collapse distinct conditions (auth vs. rate limit vs. server error) into a single generic message.
- Treat 401/403 and 429 distinctly in user-facing output. Auth errors should point to `/ollama-cloud:webtools`; rate-limit errors should say "try again shortly".
- Never send `Authorization: Bearer undefined`. Gate on the presence of `apiKey` first.

## HTTP

- Use `fetchJsonWithTimeout` from `lib.mjs` over raw `fetch`. It centralizes the timeout, the abort signal, and the standardized `{ ok, status, data, error }` return.
- Web tool timeout is 15s (`WEB_TOOLS_TIMEOUT_MS`).

## MCP Protocol

- `mcp-server.mjs` speaks NDJSON (newline-delimited JSON-RPC 2.0) over stdio. Messages with an `id` are requests and must get a response; messages without an `id` are notifications (e.g. `notifications/initialized`) and must **not** get a response.
- Always list both tools in `tools/list` regardless of the `webTools` toggle. Disabling is enforced at `tools/call` time (returns `webToolsDisabledError()`), so toggling on needs no reconnect. This trades one wasted model turn when disabled for immediate enable/disable UX — intentional.
- Echo back the client's `protocolVersion` on `initialize` (falling back to `2024-11-05`).
- Unknown methods → JSON-RPC error `-32601`; unknown tool → `-32602`.

## Slash Command

- `commands/webtools.md` is a skill whose body is injected as a prompt. It must not assume any state beyond what it reads from the config file.
- Resolve the config path cross-platform via `node -p "require('os').homedir()+'/.claude/ollama-cloud.json'"` rather than hardcoding `~`, so the absolute path works with the `Read`/`Write` tools on Windows too.
- Never echo the API key back into the conversation. Confirm with "API key 已保存" only.
- The skill supports direct arguments (`on`/`off`/`enable`/`disable`/`key`) to skip the menu.

## Documentation Accuracy

The README and inline comments describe observable behavior. When the behavior changes, update both in the same change.

## Verification Commands

- After code changes (not docs): `npm run check`. Fix all errors, warnings, and infos before committing.
- Run `npm run test` before pushing. CI runs lint, unit tests, and the MCP handshake smoke.
- `npm run smoke:mcp` exercises the stdio protocol (initialize / tools/list / tools/call) without needing an API key.
- There is no build step. The plugin ships plain `.mjs` files.

## Changelog

Location: `CHANGELOG.md` at the repo root. All entries go under `## [Unreleased]` until a release cuts them into a dated version section.

- Released and unreleased versions are both flat bullet lists, no subsections. Match the style of the existing entries.
- Released version sections (e.g. `## [0.1.0]`) are immutable; never modify them.

## Commit Format

Conventional commits, present tense, under 72 characters.

```
feat(webtools): add /ollama-cloud:webtools key subcommand
fix(server): re-read config on every tools/call
docs: clarify tool namespacing
```

Use scopes when they clarify the component: `server`, `webtools`, `config`, `ci`, `docs`. Skip them for broad changes.

## Git

- Only commit files you changed in this session.
- Stage explicit paths (`git add <path1> <path2>`); never `git add -A` or `git add .`.
- Before committing, run `git status` and verify you are only staging your files.
- Never run `git reset --hard`, `git checkout .`, `git clean -fd`, `git stash`, or `git commit --no-verify`.

## User Override

If the user's instructions conflict with any rule in this document, ask for explicit confirmation before overriding. Only then execute their instructions.