import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import * as os from "node:os";
import * as crypto from "node:crypto";
import open from "open";
import type { AuthConfig } from "./types.js";

const CONFIG_DIR = path.join(
  process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
  "enke",
);
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

/** Default API endpoints. Overridable via env vars. */
export const API_URL = process.env.ENKE_API_URL ?? "https://api.en.ke";
const USER_API_URL = process.env.ENKE_USER_API_URL ?? "https://user.zenkee.com";
const WEB_URL = process.env.ENKE_WEB_URL ?? "https://www.en.ke";

/** In-memory lock to prevent concurrent token refreshes. */
let refreshLock: Promise<string | null> | null = null;

function ensureConfigDir(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function htmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Read the stored auth config, or null if not logged in. */
export function loadConfig(): AuthConfig | null {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as AuthConfig;
  } catch {
    return null;
  }
}

function saveConfig(cfg: AuthConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

/** Remove stored auth. */
export function clearConfig(): void {
  try { fs.unlinkSync(CONFIG_FILE); } catch { /* ok */ }
}

function decodeJwtExp(token: string): number {
  try {
    const parts = token.split(".");
    if (parts.length < 2) throw new Error("Invalid JWT format");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    if (typeof payload.exp === "number" && payload.exp > 0) return payload.exp;
  } catch { /* use default */ }
  return Math.floor(Date.now() / 1000) + 3600;
}

/**
 * Start a browser-based OAuth login flow.
 *
 * 1. Starts a local HTTP server on a random port (127.0.0.1)
 * 2. Opens the browser to WEB_URL/login?redirect=http://127.0.0.1:PORT/callback
 * 3. Waits for the browser to redirect back with a token
 * 4. Validates the OAuth state parameter to prevent CSRF
 * 5. Saves the token and returns
 */
export async function login(): Promise<AuthConfig> {
  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(16).toString("hex");
    let settled = false;

    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url ?? "/", `http://127.0.0.1`);

      if (reqUrl.pathname === "/callback") {
        if (settled) { res.writeHead(200); res.end(); return; }

        // Validate OAuth state to prevent CSRF
        const returnedState = reqUrl.searchParams.get("state");
        if (returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Login failed: state mismatch. Please try again.");
          server.close();
          settled = true;
          reject(new Error("OAuth state mismatch"));
          return;
        }

        const token = reqUrl.searchParams.get("token");
        const refreshToken = reqUrl.searchParams.get("refreshToken");
        if (!token || !refreshToken) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Login failed: missing token. Please try again.");
          server.close();
          settled = true;
          reject(new Error("Missing token in callback"));
          return;
        }

        const expiresAt = decodeJwtExp(token);

        const cfg: AuthConfig = { token, refreshToken, expiresAt, apiUrl: API_URL, userApiUrl: USER_API_URL };
        saveConfig(cfg);

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding-top:80px">
          <h1 style="color:#4CAF50">Logged in successfully!</h1>
          <p>You can close this tab and return to the terminal.</p>
          </body></html>`);
        server.close();
        settled = true;
        resolve(cfg);
        return;
      }

      if (reqUrl.pathname === "/callback/error") {
        if (settled) { res.writeHead(200); res.end(); return; }
        const msg = htmlEscape(reqUrl.searchParams.get("message") ?? "Unknown error");
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Login failed: ${msg}`);
        server.close();
        settled = true;
        reject(new Error(`Login failed: ${msg}`));
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    server.on("error", (err) => {
      if (!settled) { settled = true; reject(err); }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        settled = true;
        reject(new Error("Failed to start callback server"));
        return;
      }
      const port = addr.port;
      const redirectUri = encodeURIComponent(`http://127.0.0.1:${port}/callback`);
      const loginUrl = `${WEB_URL}/login?redirect=${redirectUri}&state=${encodeURIComponent(state)}&source=cli`;
      open(loginUrl).catch(() => {
        console.error(`Please open this URL in your browser:\n\n  ${loginUrl}\n`);
      });
    });

    setTimeout(() => {
      if (!settled) { try { server.close(); } catch { /* ok */ } settled = true; reject(new Error("Login timed out after 5 minutes")); }
    }, 300_000);
  });
}

/** Return the current token, refreshing if needed. Returns null if not logged in. */
export async function getToken(): Promise<string | null> {
  const cfg = loadConfig();
  if (!cfg) return null;

  // Check if token is still valid (with 60s buffer)
  if (cfg.expiresAt > Math.floor(Date.now() / 1000) + 60) {
    return cfg.token;
  }

  // Use in-memory lock to prevent concurrent refresh
  if (refreshLock) return refreshLock;

  refreshLock = (async () => {
    try {
      const latestCfg = loadConfig();
      if (!latestCfg) return null;

      const res = await fetch(`${latestCfg.userApiUrl}/api/v1/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: latestCfg.refreshToken }),
      });

      if (!res.ok) {
        // Only clear config on 401 (invalid/expired refresh token), not on network errors
        if (res.status === 401) clearConfig();
        return null;
      }
      const data = await res.json() as { data?: { token?: string; refreshToken?: string } };
      const newToken = data.data?.token;
      const newRefresh = data.data?.refreshToken;
      if (!newToken || !newRefresh) {
        clearConfig();
        return null;
      }

      const expiresAt = decodeJwtExp(newToken);
      const newCfg: AuthConfig = { ...latestCfg, token: newToken, refreshToken: newRefresh, expiresAt };
      saveConfig(newCfg);
      return newToken;
    } catch {
      // Network errors: don't clear config, just return stale token as best effort
      const cfg = loadConfig();
      return cfg?.token ?? null;
    } finally {
      refreshLock = null;
    }
  })();

  return refreshLock;
}

/** Remove stored credentials. */
export function logout(): void {
  clearConfig();
}
