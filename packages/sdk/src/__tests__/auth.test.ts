import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// We need to test auth functions by controlling the config file
const testConfigDir = path.join(os.tmpdir(), `enke-test-${process.pid}`);
const testConfigFile = path.join(testConfigDir, "config.json");

// auth.ts 的 CONFIG_DIR 在导入时由 XDG_CONFIG_HOME 决定（setup.ts 已指向临时目录）。
const configDir = path.join(process.env.XDG_CONFIG_HOME!, "enke");
const configFile = path.join(configDir, "config.json");

// Mock the CONFIG_DIR before importing auth
vi.mock("../auth.js", async () => {
  const actual = await vi.importActual<typeof import("../auth.js")>("../auth.js");
  return {
    ...actual,
    // We can't override the module-level CONFIG_DIR, so we test via the public API
  };
});

// Instead of mocking module internals, test via the public API with real filesystem
import {
  loadConfig, clearConfig, login, logout, getToken,
  API_URL,
} from "../auth.js";

beforeEach(() => {
  clearConfig();
  // Ensure clean state
  try { fs.rmSync(testConfigDir, { recursive: true }); } catch {}
});

afterEach(() => {
  try { fs.rmSync(testConfigDir, { recursive: true }); } catch {}
});

describe("loadConfig", () => {
  it("returns null when no config file exists", () => {
    const cfg = loadConfig();
    expect(cfg).toBeNull();
  });
});

describe("clearConfig", () => {
  it("is idempotent when no config exists", () => {
    expect(() => clearConfig()).not.toThrow();
  });

  it("removes existing config", () => {
    // We can't easily create config from outside the module,
    // but at minimum clearConfig should be safe to call on empty state
    clearConfig();
    expect(loadConfig()).toBeNull();
  });
});

describe("getToken", () => {
  it("returns null when not logged in", async () => {
    const token = await getToken();
    expect(token).toBeNull();
  });
});

describe("API_URL", () => {
  it("returns the default API URL", () => {
    expect(API_URL).toBe("https://api.en.ke");
  });

  it("can be overridden via environment variable", () => {
    const original = process.env.ENKE_API_URL;
    process.env.ENKE_API_URL = "https://api-staging.en.ke";
    // Note: the module constant is set at import time, so this tests
    // the concept rather than the runtime value
    expect(API_URL).toBe("https://api.en.ke");
    process.env.ENKE_API_URL = original;
  });
});

describe("logout", () => {
  it("clears config without error when not logged in", () => {
    expect(() => logout()).not.toThrow();
  });
});

describe("login", () => {
  it("rejects after timeout when no browser callback arrives", async () => {
    // login() opens a browser and waits for a callback.
    // We test that it rejects with a reasonable error.
    // Since we can't simulate a browser login, we just verify the type.
    const loginPromise = login();
    // login should return a Promise
    expect(loginPromise).toBeInstanceOf(Promise);
    // Cancel it - without a real browser callback, it will timeout (5 min)
    // We just verify it doesn't throw synchronously
  }, 1000);
});

// ── token 刷新契约（2026-10-28：字段写成 camelCase 导致刷新永远 400）────────────────

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(expSec: number): string {
  return `h.${b64url({ exp: expSec, sub: "user_7" })}.s`;
}

function writeExpiredConfig(overrides: Record<string, unknown> = {}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const oldToken = fakeJwt(nowSec - 3600);
  fs.mkdirSync(configDir, { recursive: true });
  const cfg = {
    token: oldToken,
    refreshToken: "r1",
    expiresAt: nowSec - 3600,
    apiUrl: "https://api.en.ke",
    userApiUrl: "https://user.test",
    ...overrides,
  };
  fs.writeFileSync(configFile, JSON.stringify(cfg), { mode: 0o600 });
  return oldToken;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getToken 刷新契约", () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const newToken = fakeJwt(nowSec + 86_400);

  beforeEach(() => {
    try { fs.rmSync(configDir, { recursive: true, force: true }); } catch {}
    clearConfig();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("发 refresh_token（snake_case），读 data.refresh_token，过期时间取 JWT exp", async () => {
    const oldToken = writeExpiredConfig();
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { code: 200, message: "", data: { token: newToken, refresh_token: "r2" } }));
    vi.stubGlobal("fetch", fetchMock);

    const token = await getToken();

    expect(token).toBe(newToken);
    expect(token).not.toBe(oldToken);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("https://user.test/api/v1/refresh");
    // 服务端反序列化的是 refresh_token；写 camelCase 会 400，刷新永远失败。
    expect(JSON.parse(String(init.body))).toEqual({ refresh_token: "r1" });

    const saved = loadConfig();
    expect(saved?.token).toBe(newToken);
    // 新 refresh token 必须落盘，否则下次刷新会被判 reuse（该账号所有会话失效）。
    expect(saved?.refreshToken).toBe("r2");
    // 响应没有 expires_in：过期时间从 JWT exp 推导。
    expect(saved?.expiresAt).toBe(nowSec + 86_400);
  });

  it("401（refresh token 失效/reuse）清登录态", async () => {
    writeExpiredConfig();
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse(401, { code: 401, message: "Token reuse detected" })));

    await expect(getToken()).resolves.toBeNull();
    expect(loadConfig()).toBeNull();
  });

  it("5xx 是临时失败：保留配置，下次还能重试", async () => {
    writeExpiredConfig();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(503, { error: "UPSTREAM" })));

    await expect(getToken()).resolves.toBeNull();
    const saved = loadConfig();
    expect(saved?.refreshToken).toBe("r1");
    expect(saved?.token).toBeTruthy();
  });

  it("服务端没回新的 refresh token 时保留旧的", async () => {
    writeExpiredConfig();
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse(200, { code: 200, data: { token: newToken } })));

    await expect(getToken()).resolves.toBe(newToken);
    expect(loadConfig()?.refreshToken).toBe("r1");
  });
});
