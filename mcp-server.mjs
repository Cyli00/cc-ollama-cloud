// Ollama Cloud web tools 的 MCP server（stdio，零依赖）。
//
// 手写 JSON-RPC 2.0 over stdin/stdout，实现 MCP 规范中最小可用的工具 server：
//   - initialize / notifications/initialized
//   - tools/list  -> 始终列出 ollama_web_search / ollama_web_fetch
//   - tools/call  -> 每次调用读取 ~/.claude/ollama-cloud.json，开关即时生效
//
// 工具逻辑与配置加载都在 ./lib.mjs 中，本文件只负责协议适配。

import { executeWebFetch, executeWebSearch, loadConfig } from "./lib.mjs";

const SERVER_NAME = "ollama-cloud";
const SERVER_VERSION = "1.0.0";
// 与广泛兼容的客户端协商使用的协议版本；若客户端请求更高版本则回显客户端版本。
const DEFAULT_PROTOCOL_VERSION = "2024-11-05";

// --- 工具定义 ---

const TOOLS = [
  {
    name: "ollama_web_search",
    description:
      "Search the web for real-time information using Ollama Cloud's web search API. " +
      "Returns relevant results with titles, URLs, and content snippets. " +
      "Requires an Ollama Cloud API key (configure via the /ollama-cloud:webtools command).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query to execute" },
        max_results: {
          type: "integer",
          description: "Maximum number of search results to return (default: 5, max: 10)",
          default: 5,
          minimum: 1,
          maximum: 10,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "ollama_web_fetch",
    description:
      "Fetch and extract text content from a web page URL using Ollama Cloud's web fetch API. " +
      "Returns the page title, main content, and links found on the page. " +
      "Requires an Ollama Cloud API key (configure via the /ollama-cloud:webtools command).",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch and extract content from", format: "uri" },
      },
      required: ["url"],
    },
  },
];

// --- JSON-RPC 响应辅助 ---

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function result(id, value) {
  if (id === undefined || id === null) return; // 通知不需要响应
  send({ jsonrpc: "2.0", id, result: value });
}

function error(id, code, message) {
  if (id === undefined || id === null) return;
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

// --- 请求分发 ---

async function handleRequest(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize": {
      const clientVersion = params?.protocolVersion;
      const protocolVersion = typeof clientVersion === "string" ? clientVersion : DEFAULT_PROTOCOL_VERSION;
      return result(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
    }

    case "ping": {
      return result(id, {});
    }

    case "tools/list": {
      return result(id, { tools: TOOLS });
    }

    case "tools/call": {
      const name = params?.name;
      const args = params?.arguments ?? {};
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return error(id, -32602, `Unknown tool: ${name}`);

      // 每次调用都重新读取配置，使 /ollama-cloud:webtools 的开关与 key 改动即时生效。
      const config = loadConfig();

      try {
        if (name === "ollama_web_search") {
          return result(id, await executeWebSearch(args, config));
        }
        if (name === "ollama_web_fetch") {
          return result(id, await executeWebFetch(args, config));
        }
        return error(id, -32602, `Unknown tool: ${name}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return result(id, {
          content: [{ type: "text", text: `Tool execution failed: ${message}` }],
          isError: true,
        });
      }
    }

    default: {
      return error(id, -32601, `Method not found: ${method}`);
    }
  }
}

// --- stdio 主循环 ---

let buffer = "";

process.stdin.setEncoding("utf-8");

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  // JSON-RPC 消息以换行分隔（NDJSON）。
  let nl = buffer.indexOf("\n");
  while (nl !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    nl = buffer.indexOf("\n");
    if (line.length === 0) continue;
    handleMessage(line);
  }
});

process.stdin.on("end", () => process.exit(0));

function handleMessage(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    // 无法解析的消息直接丢弃；无 id 无法回应。
    return;
  }
  // 通知（无 id）静默处理；请求交由分发器处理。
  if (msg.id === undefined && msg.method !== undefined) {
    // notifications/initialized 等无需响应。
    return;
  }
  handleRequest(msg).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    error(msg?.id, -32603, `Internal error: ${message}`);
  });
}
