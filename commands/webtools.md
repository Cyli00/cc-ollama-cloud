---
name: webtools
description: 配置 Ollama Cloud API key 并开关 web 工具（ollama_web_search / ollama_web_fetch）。可带参数 on/off/enable/disable 直接切换，或 key 配置 API key，不带参数则进入交互菜单。
disable-model-invocation: true
argument-hint: [on|off|enable|disable|key]
allowed-tools:
  - Bash(node *)
  - Read
  - Write
---

# /ollama-cloud:webtools

你正在管理 Ollama Cloud web 工具的配置。配置文件位于用户主目录下的
`~/.claude/ollama-cloud.json`，是一个 JSON 对象，字段：

- `apiKey` (string)：Ollama Cloud API key
- `webTools` (boolean)：是否启用 web 工具，默认 `true`

MCP server（`mcp-server.mjs`）在每次工具调用时都会重新读取这个文件，因此本命令
对 key 或开关的修改会即时生效，无需重载插件。

## 第 1 步：定位配置文件并读取当前状态

运行下面的命令获取配置文件的绝对路径（跨平台，使用 Node 的 `os.homedir()`）：

```bash
node -p "require('os').homedir()+'/.claude/ollama-cloud.json'"
```

记下输出的路径（下文称作 `$CONFIG`）。然后用 Read 工具读取 `$CONFIG`；若文件不
存在，则视为空配置 `{}`（`apiKey` 未设置、`webTools` 默认 `true`）。

## 第 2 步：根据参数决定流程

参数 `$ARGUMENTS`（已去空格并转小写）可能是以下之一：`on`/`enable`、`off`/`disable`、
`key`、或为空。

- `on` / `enable`：直接跳到「设置 webTools = true 并保存」。
- `off` / `disable`：直接跳到「设置 webTools = false 并保存」。
- `key`：直接跳到「配置 API key」。
- 为空：进入「交互菜单」。

## 交互菜单

使用 AskUserQuestion 向用户展示一个问题（单选，header 为「操作」）：

> 你想对 Ollama Cloud web 工具做什么？当前状态：API key = {已设置/未设置}，web 工具 = {已启用/已禁用}。

选项（按当前状态调整措辞，保持这四个语义）：

1. 「配置 / 替换 API key」—— 进入「配置 API key」
2. 「启用 web 工具」—— 进入「设置 webTools = true 并保存」（若已启用则提示无需更改）
3. 「禁用 web 工具」—— 进入「设置 webTools = false 并保存」（若已禁用则提示无需更改）
4. 「查看状态」—— 仅展示当前状态后结束

在问题文本里把当前状态写清楚，方便用户判断。

## 配置 API key

用 AskUserQuestion 向用户索取 key（单选，header 为「API key」），问题：

> 请粘贴你的 Ollama Cloud API key（可在 https://ollama.com 获取）。选择「Other」直接粘贴 key；若不想把 key 写入文件，可选「改用环境变量」。

选项：

1. 「改用 OLLAMA_API_KEY 环境变量（不写入文件）」—— 提示用户在 shell 里设置
   `OLLAMA_API_KEY` 后即可使用，不在文件中保存，然后结束。
2. 「取消」—— 结束，不做改动。

用户选择 Other 粘贴的文本即为 API key。拿到 key 后进入「合并并保存」（写入
`apiKey` 字段）。不要把 key 原文回显到对话里，确认时只说「API key 已保存」。

## 设置 webTools = true / false 并保存

进入「合并并保存」，写入对应 `webTools` 值。完成后用一句话告知用户结果，例如：
「web 工具已启用，ollama_web_search / ollama_web_fetch 现在可用。」或
「web 工具已禁用，工具调用将返回禁用提示。」

## 合并并保存

把当前配置与新字段合并（保留未改动的字段），用 Write 工具把合并后的 JSON 写入
`$CONFIG`。格式化为两空格缩进、末尾换行的 JSON。例如设置 key 后写入：

```json
{
  "apiKey": "…",
  "webTools": true
}
```

设置开关时同理，保留已有的 `apiKey`。

## 备注

- 若用户倾向不把 key 写进文件，可让其设置 `OLLAMA_API_KEY` 环境变量，MCP server
  会作为兜底读取；也可设置 `OLLAMA_WEB_TOOLS=0` 作为硬关闭开关（优先级高于配置文件）。
- 不要在对话中回显 API key 原文。