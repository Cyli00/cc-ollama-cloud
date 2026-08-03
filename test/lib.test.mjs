import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeWebFetch,
  executeWebSearch,
  formatFetchResult,
  formatSearchResults,
  isFetchResponse,
  isSearchResponse,
  resolveApiKey,
  resolveWebToolsEnabled,
  resolveWebToolsEnv,
  sanitizeConfig,
  webToolsDisabledError,
  noApiKeyError,
} from "../lib.mjs";

// --- 配置清洗 ---

describe("sanitizeConfig", () => {
  it("保留合法的 apiKey 与 webTools，丢弃未知键与类型错误值", () => {
    expect(sanitizeConfig({ apiKey: "k", webTools: false, extra: 1 })).toEqual({ apiKey: "k", webTools: false });
    expect(sanitizeConfig({ apiKey: "", webTools: "yes" })).toEqual({});
    expect(sanitizeConfig({ apiKey: 123 })).toEqual({});
  });
});

// --- 环境变量解析 ---

describe("resolveWebToolsEnv", () => {
  const original = process.env.OLLAMA_WEB_TOOLS;
  beforeEach(() => delete process.env.OLLAMA_WEB_TOOLS);
  afterEach(() => {
    if (original === undefined) delete process.env.OLLAMA_WEB_TOOLS;
    else process.env.OLLAMA_WEB_TOOLS = original;
  });

  it("未设置时返回 undefined", () => {
    expect(resolveWebToolsEnv()).toBeUndefined();
  });
  it('"0"/"false"/"no"/"off"/"" 返回 false', () => {
    for (const v of ["0", "false", "no", "off", ""]) {
      process.env.OLLAMA_WEB_TOOLS = v;
      expect(resolveWebToolsEnv()).toBe(false);
    }
  });
  it("其余值返回 true", () => {
    process.env.OLLAMA_WEB_TOOLS = "1";
    expect(resolveWebToolsEnv()).toBe(true);
  });
});

// --- API key 解析 ---

describe("resolveApiKey", () => {
  const original = process.env.OLLAMA_API_KEY;
  beforeEach(() => delete process.env.OLLAMA_API_KEY);
  afterEach(() => {
    if (original === undefined) delete process.env.OLLAMA_API_KEY;
    else process.env.OLLAMA_API_KEY = original;
  });

  it("配置文件优先于环境变量", () => {
    process.env.OLLAMA_API_KEY = "env-key";
    expect(resolveApiKey({ apiKey: "file-key" })).toBe("file-key");
  });
  it("无配置时回退到环境变量", () => {
    process.env.OLLAMA_API_KEY = "env-key";
    expect(resolveApiKey({})).toBe("env-key");
  });
  it("两者都没有时返回 undefined", () => {
    expect(resolveApiKey({})).toBeUndefined();
  });
});

// --- web 工具开关解析 ---

describe("resolveWebToolsEnabled", () => {
  const original = process.env.OLLAMA_WEB_TOOLS;
  beforeEach(() => delete process.env.OLLAMA_WEB_TOOLS);
  afterEach(() => {
    if (original === undefined) delete process.env.OLLAMA_WEB_TOOLS;
    else process.env.OLLAMA_WEB_TOOLS = original;
  });

  it("默认 true", () => {
    expect(resolveWebToolsEnabled({})).toBe(true);
  });
  it("配置文件 false 时返回 false", () => {
    expect(resolveWebToolsEnabled({ webTools: false })).toBe(false);
  });
  it("环境变量覆盖配置文件", () => {
    process.env.OLLAMA_WEB_TOOLS = "0";
    expect(resolveWebToolsEnabled({ webTools: true })).toBe(false);
  });
});

// --- 响应校验 ---

describe("response validators", () => {
  it("isSearchResponse", () => {
    expect(isSearchResponse({ results: [] })).toBe(true);
    expect(isSearchResponse({ results: "x" })).toBe(false);
    expect(isSearchResponse(null)).toBe(false);
  });
  it("isFetchResponse", () => {
    expect(isFetchResponse({ title: "t", content: "c", links: [] })).toBe(true);
    expect(isFetchResponse({ title: "t", content: "c", links: "x" })).toBe(false);
    expect(isFetchResponse({ title: 1, content: "c", links: [] })).toBe(false);
  });
});

// --- 格式化 ---

describe("formatters", () => {
  it("formatSearchResults 编号并拼接", () => {
    const out = formatSearchResults({ results: [{ title: "T", url: "U", content: "C" }] });
    expect(out).toContain("1. T");
    expect(out).toContain("URL: U");
    expect(out).toContain("C");
  });
  it("formatSearchResults 空结果返回 No results found.", () => {
    expect(formatSearchResults({ results: [] })).toBe("No results found.");
  });
  it("formatFetchResult 拼接标题/内容/链接", () => {
    const out = formatFetchResult({ title: "T", content: "C", links: ["https://a", "https://b"] });
    expect(out).toContain("Title: T");
    expect(out).toContain("Content:\nC");
    expect(out).toContain("Links found: 2");
    expect(out).toContain("- https://a");
  });
});

// --- 执行路径（mock fetch） ---

/** 构造一个 fetch mock，返回给定的 { ok, status, body }。 */
function mockFetch(responses) {
  const calls = [];
  const fn = vi.fn(async (url) => {
    calls.push(url);
    const r = responses.shift() ?? { ok: false, status: 0, body: "" };
    return {
      ok: r.ok,
      status: r.status,
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
    };
  });
  globalThis.fetch = fn;
  return { fn, calls };
}

describe("executeWebSearch", () => {
  const originalKey = process.env.OLLAMA_API_KEY;
  const originalWeb = process.env.OLLAMA_WEB_TOOLS;
  beforeEach(() => {
    delete process.env.OLLAMA_API_KEY;
    delete process.env.OLLAMA_WEB_TOOLS;
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.OLLAMA_API_KEY;
    else process.env.OLLAMA_API_KEY = originalKey;
    if (originalWeb === undefined) delete process.env.OLLAMA_WEB_TOOLS;
    else process.env.OLLAMA_WEB_TOOLS = originalWeb;
  });

  it("未配置 key 时返回 noApiKeyError", async () => {
    const res = await executeWebSearch({ query: "x" }, {});
    expect(res).toEqual(noApiKeyError());
  });
  it("webTools 关闭时返回禁用提示", async () => {
    const res = await executeWebSearch({ query: "x" }, { apiKey: "k", webTools: false });
    expect(res).toEqual(webToolsDisabledError());
  });
  it("成功时返回格式化结果", async () => {
    mockFetch([{ ok: true, status: 200, body: { results: [{ title: "T", url: "U", content: "C" }] } }]);
    const res = await executeWebSearch({ query: "x" }, { apiKey: "k" });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain("1. T");
  });
  it("401 时返回认证错误", async () => {
    mockFetch([{ ok: false, status: 401, body: { error: "bad" } }]);
    const res = await executeWebSearch({ query: "x" }, { apiKey: "k" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("authentication error");
  });
});

describe("executeWebFetch", () => {
  const originalKey = process.env.OLLAMA_API_KEY;
  beforeEach(() => {
    delete process.env.OLLAMA_API_KEY;
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.OLLAMA_API_KEY;
    else process.env.OLLAMA_API_KEY = originalKey;
  });

  it("成功时返回格式化结果", async () => {
    mockFetch([{ ok: true, status: 200, body: { title: "T", content: "C", links: ["https://a"] } }]);
    const res = await executeWebFetch({ url: "https://x" }, { apiKey: "k" });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain("Title: T");
  });
  it("响应形状不符时返回错误", async () => {
    mockFetch([{ ok: true, status: 200, body: { weird: true } }]);
    const res = await executeWebFetch({ url: "https://x" }, { apiKey: "k" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("unexpected response shape");
  });
});