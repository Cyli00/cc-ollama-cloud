// Ollama Cloud web tools 核心逻辑：配置加载、HTTP、响应校验与格式化。
// 纯函数模块，被 mcp-server.mjs 与单元测试共用，无外部依赖。

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// --- 常量 ---

export const OLLAMA_BASE = "https://ollama.com";
export const WEB_TOOLS_TIMEOUT_MS = 15000;

/**
 * 配置文件默认路径：~/.claude/ollama-cloud.json
 * 可通过环境变量 OLLAMA_CLOUD_CONFIG 覆盖。
 */
export function defaultConfigPath() {
  return process.env.OLLAMA_CLOUD_CONFIG ?? join(homedir(), ".claude", "ollama-cloud.json");
}

// --- 类型 ---

/**
 * @typedef {Object} OllamaCloudConfig
 * @property {string|undefined} apiKey - Ollama Cloud API key
 * @property {boolean|undefined} webTools - 是否启用 web 工具，默认 true
 */

// --- 配置 ---

/**
 * 校验并清洗解析后的 JSON 对象，丢弃未知键与类型错误的值。
 * @param {Record<string, unknown>} raw
 * @returns {OllamaCloudConfig}
 */
export function sanitizeConfig(raw) {
  const out = {};
  if (typeof raw.apiKey === "string" && raw.apiKey.length > 0) out.apiKey = raw.apiKey;
  if (typeof raw.webTools === "boolean") out.webTools = raw.webTools;
  return out;
}

/**
 * 加载配置。文件不存在或解析失败时返回空对象（默认值由调用方填充）。
 * @param {string} [configPath]
 * @returns {OllamaCloudConfig}
 */
export function loadConfig(configPath = defaultConfigPath()) {
  if (!existsSync(configPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return sanitizeConfig(parsed);
  } catch (err) {
    console.error(`[ollama-cloud] Failed to load config from ${configPath}: ${err}`);
    return {};
  }
}

/**
 * 解析 OLLAMA_WEB_TOOLS 环境变量开关。
 * 未设置返回 undefined；"0"/"false"/"no"/"off"/"" 返回 false；其余返回 true。
 * @returns {boolean|undefined}
 */
export function resolveWebToolsEnv() {
  const raw = process.env.OLLAMA_WEB_TOOLS;
  if (raw === undefined) return undefined;
  const lowered = raw.toLowerCase();
  if (["0", "false", "no", "off", ""].includes(lowered)) return false;
  return true;
}

/**
 * 解析最终的 API key：配置文件优先，OLLAMA_API_KEY 环境变量兜底。
 * @param {OllamaCloudConfig} config
 * @returns {string|undefined}
 */
export function resolveApiKey(config) {
  return config.apiKey ?? process.env.OLLAMA_API_KEY;
}

/**
 * 解析 web 工具是否启用：环境变量覆盖 > 配置文件 > 默认 true。
 * @param {OllamaCloudConfig} config
 * @returns {boolean}
 */
export function resolveWebToolsEnabled(config) {
  const env = resolveWebToolsEnv();
  if (env !== undefined) return env;
  return config.webTools !== false;
}

// --- HTTP ---

/**
 * 带超时的 JSON 请求。返回标准化结果（含 ok/status/data/error）。
 * @template T
 * @param {string} url
 * @param {RequestInit} init
 * @param {number} timeoutMs
 * @param {AbortSignal} [externalSignal]
 * @returns {Promise<{ok: boolean; status: number; data: T|null; error?: string}>}
 */
export async function fetchJsonWithTimeout(url, init, timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // data 保持 null，错误信息回退为原始文本
    }
    const error =
      data && typeof data === "object" && "error" in data
        ? typeof data.error === "object"
          ? JSON.stringify(data.error)
          : String(data.error)
        : text;
    return { ok: res.ok, status: res.status, data, error: res.ok ? undefined : error };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
    if (externalSignal && !externalSignal.aborted) externalSignal.removeEventListener("abort", onExternalAbort);
  }
}

// --- 响应校验 ---

/**
 * @typedef {Object} SearchResponse
 * @property {Array<{title: string; url: string; content: string}>} results
 */

/**
 * @typedef {Object} FetchResponse
 * @property {string} title
 * @property {string} content
 * @property {string[]} links
 */

/** @param {unknown} data */
export function isSearchResponse(data) {
  return data != null && typeof data === "object" && Array.isArray(/** @type {any} */ (data).results);
}

/** @param {unknown} data */
export function isFetchResponse(data) {
  if (data == null || typeof data !== "object") return false;
  const d = /** @type {any} */ (data);
  return typeof d.title === "string" && typeof d.content === "string" && Array.isArray(d.links);
}

// --- 格式化 ---

/** @param {SearchResponse} data */
export function formatSearchResults(data) {
  const formatted = data.results.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content}`).join("\n\n");
  return formatted || "No results found.";
}

/** @param {FetchResponse} data */
export function formatFetchResult(data) {
  return [
    `Title: ${data.title}`,
    "",
    "Content:",
    data.content,
    "",
    `Links found: ${data.links?.length ?? 0}`,
    ...(data.links?.slice(0, 10).map((l) => `  - ${l}`) ?? []),
  ].join("\n");
}

// --- 错误响应构建（返回 MCP tools/call 结果） ---

/** 无 API key 时的错误结果。 */
export function noApiKeyError() {
  return textResult(
    "Error: No Ollama Cloud API key configured. Run /ollama-cloud:webtools to set it, " +
      "set the OLLAMA_API_KEY env var, or add `apiKey` to ~/.claude/ollama-cloud.json.",
    true,
  );
}

/** web 工具被关闭时的提示结果。 */
export function webToolsDisabledError() {
  return textResult(
    "Ollama Cloud web tools are disabled. Run /ollama-cloud:webtools and choose " + '"Enable" to turn them back on.',
    true,
  );
}

/** 搜索请求非 ok 时的错误结果，按状态码区分提示。 */
export function searchError(status, error) {
  if (status === 401 || status === 403) {
    return textResult(
      "Ollama Cloud search failed: authentication error. Check your API key " +
        "(run /ollama-cloud:webtools to reconfigure).",
      true,
    );
  }
  if (status === 429) return textResult("Ollama Cloud search failed: rate limited. Try again shortly.", true);
  return textResult(`Search API error (status ${status}): ${error || "unknown error"}`, true);
}

/** 抓取请求非 ok 时的错误结果，按状态码区分提示。 */
export function fetchError(status, error) {
  if (status === 401 || status === 403) {
    return textResult(
      "Ollama Cloud fetch failed: authentication error. Check your API key " +
        "(run /ollama-cloud:webtools to reconfigure).",
      true,
    );
  }
  if (status === 429) return textResult("Ollama Cloud fetch failed: rate limited. Try again shortly.", true);
  return textResult(`Fetch API error (status ${status}): ${error || "unknown error"}`, true);
}

/**
 * 构造一个 MCP text content 结果。
 * @param {string} text
 * @param {boolean} [isError]
 */
export function textResult(text, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

// --- 工具执行 ---

/**
 * 执行 web_search。返回 MCP tools/call 结果对象。
 * @param {{query: string; max_results?: number}} params
 * @param {OllamaCloudConfig} config
 * @param {AbortSignal} [signal]
 */
export async function executeWebSearch(params, config, signal) {
  if (!resolveWebToolsEnabled(config)) return webToolsDisabledError();
  const apiKey = resolveApiKey(config);
  if (!apiKey) return noApiKeyError();

  const res = await fetchJsonWithTimeout(
    `${OLLAMA_BASE}/api/web_search`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: params.query, max_results: params.max_results ?? 5 }),
    },
    WEB_TOOLS_TIMEOUT_MS,
    signal,
  );
  if (!res.ok) return searchError(res.status, res.error);
  if (!isSearchResponse(res.data))
    return textResult("Web search failed: unexpected response shape from the API.", true);
  return textResult(formatSearchResults(/** @type {SearchResponse} */ (res.data)));
}

/**
 * 执行 web_fetch。返回 MCP tools/call 结果对象。
 * @param {{url: string}} params
 * @param {OllamaCloudConfig} config
 * @param {AbortSignal} [signal]
 */
export async function executeWebFetch(params, config, signal) {
  if (!resolveWebToolsEnabled(config)) return webToolsDisabledError();
  const apiKey = resolveApiKey(config);
  if (!apiKey) return noApiKeyError();

  const res = await fetchJsonWithTimeout(
    `${OLLAMA_BASE}/api/web_fetch`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: params.url }),
    },
    WEB_TOOLS_TIMEOUT_MS,
    signal,
  );
  if (!res.ok) return fetchError(res.status, res.error);
  if (!isFetchResponse(res.data)) return textResult("Web fetch failed: unexpected response shape from the API.", true);
  return textResult(formatFetchResult(/** @type {FetchResponse} */ (res.data)));
}
