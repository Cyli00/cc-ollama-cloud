// MCP server stdio 握手 smoke 测试。
//
// 不需要 API key：只验证 initialize / tools/list 协议握手正确，以及 tools/call
// 在缺少 key 时返回友好的错误结果。通过 `npm run smoke:mcp` 运行。

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "mcp-server.mjs");

let failed = false;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

const child = spawn(process.execPath, [serverPath], { stdio: ["pipe", "pipe", "inherit"] });

let buffer = "";
/** @type {Array<(msg: any) => void>} */
const pending = [];
const replies = [];

child.stdout.setEncoding("utf-8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let nl = buffer.indexOf("\n");
  while (nl !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    nl = buffer.indexOf("\n");
    if (!line) continue;
    const msg = JSON.parse(line);
    replies.push(msg);
    const resolve = pending.shift();
    if (resolve) resolve(msg);
  }
});

/** 发送一条 JSON-RPC 消息并等待对应 id 的响应。 */
function send(msg) {
  return new Promise((resolve) => {
    pending.push(resolve);
    child.stdin.write(`${JSON.stringify(msg)}\n`);
  });
}

await (async () => {
  // 1. initialize
  const init = await send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0" } },
  });
  if (!init.result?.capabilities?.tools) fail(`initialize 未声明 tools 能力: ${JSON.stringify(init)}`);
  else console.log("PASS: initialize 返回 tools 能力。");

  // notifications/initialized（无响应）
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

  // 2. tools/list
  const list = await send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const names = list.result?.tools?.map((t) => t.name);
  if (JSON.stringify(names) !== JSON.stringify(["ollama_web_search", "ollama_web_fetch"])) {
    fail(`tools/list 返回异常: ${JSON.stringify(names)}`);
  } else console.log("PASS: tools/list 返回两个工具。");

  // 3. tools/call（无 key → 友好错误，不应抛异常）
  const call = await send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "ollama_web_search", arguments: { query: "hi" } },
  });
  if (call.result?.isError !== true) fail(`tools/call 缺 key 时应返回 isError: ${JSON.stringify(call)}`);
  else console.log("PASS: tools/call 缺 key 时返回友好错误。");

  // 4. 未知工具 → JSON-RPC error
  const unknown = await send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope", arguments: {} } });
  if (!unknown.error || unknown.error.code !== -32602) fail(`未知工具应返回 -32602: ${JSON.stringify(unknown)}`);
  else console.log("PASS: 未知工具返回 -32602。");

  child.stdin.end();
})();

await new Promise((resolve) => child.on("exit", resolve));

if (failed) process.exit(1);
console.log("All MCP smoke checks passed.");