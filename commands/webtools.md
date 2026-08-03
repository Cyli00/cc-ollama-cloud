---
name: webtools
description: 配置 Ollama Cloud API key 并开关 web 工具（ollama_web_search / ollama_web_fetch）。可带参数 on/off/enable/disable 直接切换，key 配置 API key，不带参数则弹出二选一菜单。
disable-model-invocation: true
argument-hint: [on|off|enable|disable|key]
allowed-tools:
  - Bash(node *)
  - Read
  - Write
---

# /ollama-cloud:webtools

**第一轮立即调用 AskUserQuestion（见「无参数」或「配置 API key」），不要先读取配置文件、不要输出说明性文字。** 仅当参数为 `on`/`off`/`enable`/`disable` 时才跳过 AskUserQuestion，直接进入「合并并保存」。

配置文件 `~/.claude/ollama-cloud.json` 是一个 JSON 对象，字段：`apiKey` (string，Ollama Cloud API key)、`webTools` (boolean，是否启用 web 工具，默认 `true`)。MCP server 在每次工具调用时都重新读取这个文件，因此本命令的修改即时生效，无需重载插件。

## 参数分支

参数 `$ARGUMENTS`（已去空格并转小写）可能是以下之一：

- `on` / `enable`：直接进入「合并并保存」，写入 `webTools = true`。
- `off` / `disable`：直接进入「合并并保存」，写入 `webTools = false`。
- `key`：直接进入「配置 API key」。
- 为空：进入「无参数」。

## 无参数

立即用 AskUserQuestion 向用户展示一个问题（单选，header 为「操作」），不先读配置：

> 对 Ollama Cloud web 工具做什么？

选项：

1. 「配置 / 替换 API key」—— 进入「配置 API key」
2. 「切换 web 工具开关」—— 进入「切换开关」

## 配置 API key

用 AskUserQuestion 向用户索取 key（单选，header 为「API key」），问题：

> 请粘贴你的 Ollama Cloud API key（可在 https://ollama.com 获取）。选择「Other」直接粘贴 key；若不想把 key 写入文件，可选「改用环境变量」。

选项：

1. 「改用 OLLAMA_API_KEY 环境变量（不写入文件）」—— 提示用户在 shell 里设置
   `OLLAMA_API_KEY` 后即可使用，不在文件中保存，然后结束。
2. 「取消」—— 结束，不做改动。

用户选择 Other 粘贴的文本即为 API key。拿到 key 后进入「合并并保存」（写入
`apiKey` 字段）。不要把 key 原文回显到对话里，确认时只说「API key 已保存」。

## 切换开关

先运行下面的命令取得配置文件绝对路径（跨平台）：

```bash
node -p "require('os').homedir()+'/.claude/ollama-cloud.json'"
```

记下路径（下文称作 `$CONFIG`），用 Read 读取；文件不存在则视为空配置 `{}`（`webTools`
默认 `true`）。再用 AskUserQuestion（单选，header 为「web 工具」），问题文本写清当前状态：

> web 工具当前：{已启用/已禁用}。设为？

选项：

1. 「启用」—— 进入「合并并保存」，写入 `webTools = true`
2. 「禁用」—— 进入「合并并保存」，写入 `webTools = false`

保存后用一句话告知结果，例如：「web 工具已启用，ollama_web_search / ollama_web_fetch
现在可用。」或「web 工具已禁用，工具调用将返回禁用提示。」若已是目标状态则提示无需更改。

## 合并并保存

若尚未取得 `$CONFIG`，先运行上面的 `node -p "require('os').homedir()+'/.claude/ollama-cloud.json'"`
取得路径，并用 Read 读取当前配置（不存在视为 `{}`）。把当前配置与新字段合并（保留未改动的
字段），用 Write 工具把合并后的 JSON 写入 `$CONFIG`。格式化为两空格缩进、末尾换行的 JSON。
例如设置 key 后写入：

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