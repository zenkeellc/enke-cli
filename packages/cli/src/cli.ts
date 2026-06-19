#!/usr/bin/env node

import { realpathSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import {
  login, logout, loadConfig, getToken, clearConfig,
  shorten, listLinks, getLink, deleteLink, updateLink, getLinkStats,
  createLanding, whoami, EnkeError,
  MemClient, MemApiError,
} from "enke-sdk";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { name: string; version: string };
const VERSION: string = pkg.version;

const DEFAULT_PAGE_SIZE = 20;

// ── Global flags ──

let VERBOSE = false;

function debug(...args: unknown[]): void {
  if (VERBOSE) console.error("[DEBUG]", ...args);
}

/** Print a structured error, surfacing errorCode and params for scripting. */
function printError(err: unknown, asJson: boolean): void {
  if (err instanceof EnkeError) {
    if (asJson) {
      console.log(JSON.stringify({
        error: true,
        message: err.message,
        code: err.errorCode ?? "UNKNOWN",
        status: err.statusCode,
        params: err.params ?? {},
      }, null, 2));
    } else {
      const code = err.errorCode ? ` [${err.errorCode}]` : "";
      console.error(`Error (${err.statusCode})${code}: ${err.message}`);
    }
  } else {
    const msg = err instanceof Error ? err.message : String(err);
    if (asJson) {
      console.log(JSON.stringify({ error: true, message: msg }));
    } else {
      console.error("Error:", msg);
      if (VERBOSE && err instanceof Error && err.stack) {
        console.error(err.stack);
      }
    }
  }
}

/** Check if global --json flag is set. */
function isJson(opts: Record<string, string>): boolean {
  return opts.json === "true";
}

function help(): void {
  console.log(`en.ke — secure link & context relay for AI agents

Usage:
  enke login                          Log in via browser (OAuth)
  enke logout                         Remove stored credentials
  enke whoami                         Show logged-in user info
  enke version [--json]               Show CLI version
  enke update [--json]                Check for updates

  enke token info                     Show token expiry & API endpoint
  enke config show                    Show current configuration
  enke config clear                   Remove stored credentials

  enke link create <url>              Shorten a URL
  enke link get <slug>                Show full link details
  enke link list [--cursor c] [--all] List your short links
  enke link stats <slug>              Click analytics for a link
  enke link delete <slug>             Revoke a short link
  enke link update <slug> [opts]      Update a link's properties

  enke landing create <slug> <title>  Create a landing page
          [--links url1,title1;url2,title2]

  enke doc upload <file>              Share a document
  enke doc list [--cursor c] [--all] List shared documents
  enke doc get <slug>                 Show document details
  enke doc delete <slug>              Delete a shared document
  enke doc update <slug> [opts]       Update document settings
  enke doc renew <slug>               Reset document expiration
  enke doc expire <slug> <days>       Set document expiration days

  enke mem remember <content>         Store a memory for the AI agent
  enke mem recall <query>             Search stored memories
  enke mem forget <id>                Delete a memory
  enke mem list [--type t]            List all memories
  enke mem stats                      Memory statistics
  enke mem session create             Create a session
  enke mem session context <id>       Assemble context for prompt
  enke mem doc upload <file>          Upload document to knowledge base
  enke mem doc search <query>         Search documents
  enke mem doc list                   List uploaded documents
  enke mcp                            Start MCP server (stdio mode)
  enke mcp                            Start MCP server (SSE with ENKE_MCP_TRANSPORT=sse)

Global flags:
  --json          Machine-readable JSON output
  --verbose       Show debug output (API URL, request details)

Options (link create):
  --slug <slug>       Custom back-half
  --password <pwd>    Password-protect
  --keep-days <n>     Keep duration in days (default: 30)

Options (link update):
  --url <url>         New redirect URL
  --password <pwd>    New password (empty to remove)

Options (doc upload/update):
  --exp-days <n>      Expiration in days
  --password <pwd>    Password-protect
  --comment <text>    Owner-facing note
  --burn              Delete after first download
  --no-download       Preview only, no download button
  --max-downloads <n> Max download count

Shell completion:
  enke completion bash    Output bash completion script
  enke completion zsh     Output zsh completion script
  source <(enke completion bash)   Enable completions in current shell

Examples:
  enke login
  enke link create https://example.com --slug my-link --keep-days 7
  enke link list --all --json
  enke doc upload ./report.pdf --exp-days 7 --password secret123
  enke token info --json
`);
}

export function parseArgs(argv?: string[]): Record<string, string> {
  const opts: Record<string, string> = {};
  const args = (argv ?? process.argv).slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      let key: string;
      let val: string;
      const eqIdx = args[i].indexOf("=");
      if (eqIdx >= 0) {
        // --flag=value format
        key = args[i].slice(2, eqIdx);
        val = args[i].slice(eqIdx + 1);
      } else {
        key = args[i].slice(2);
        val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
      }
      opts[key] = val;
    }
  }
  return opts;
}

export function getPositionalArgs(argv?: string[]): string[] {
  const result: string[] = [];
  const args = (argv ?? process.argv).slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      if (args[i + 1] && !args[i + 1].startsWith("--")) i++;
    } else {
      result.push(args[i]);
    }
  }
  return result;
}

function printLink(link: { slug: string; shortUrl: string; url: string; createdAt: string; expiresAt: string | null; passwordProtected?: boolean }): void {
  console.log(`  Slug:       ${link.slug}`);
  console.log(`  Short URL:  ${link.shortUrl}`);
  console.log(`  Target:     ${link.url}`);
  console.log(`  Created:    ${link.createdAt}`);
  if (link.expiresAt) console.log(`  Expires:    ${link.expiresAt}`);
  if (link.passwordProtected !== undefined && link.passwordProtected) console.log(`  Protected:  password required`);
  console.log();
}

function printLinkDetail(link: Record<string, unknown>): void {
  console.log(`  Slug:       ${link.slug}`);
  console.log(`  Short URL:  ${link.shortUrl ?? `https://en.ke/${link.slug}`}`);
  console.log(`  Target:     ${link.url}`);
  console.log(`  Created:    ${link.createdAt}`);
  if (link.expiresAt) console.log(`  Expires:    ${link.expiresAt}`);
  if (link.password) console.log(`  Protected:  password required`);
  if (link.comment) console.log(`  Comment:    ${link.comment}`);
  if (link.title) console.log(`  Title:      ${link.title}`);
  if (link.description) console.log(`  Desc:       ${link.description}`);
  if (link.image) console.log(`  Image:      ${link.image}`);
  const rules = link.rules as Array<Record<string,unknown>> | undefined;
  if (rules && rules.length > 0) {
    console.log(`  Rules (${rules.length}):`);
    for (const r of rules) console.log(`    ${r.type}:${r.value} → ${r.url}`);
  }
  const ab = link.ab_targets as Array<Record<string,unknown>> | undefined;
  if (ab && ab.length > 0) {
    console.log(`  A/B Targets (${ab.length}):`);
    for (const t of ab) console.log(`    weight=${t.weight} → ${t.url}`);
  }
  const preview = link.preview as Record<string,unknown> | undefined;
  if (preview && preview.enabled) {
    console.log(`  Preview:    on (${preview.delay_seconds ?? 0}s delay)`);
    if (preview.title) console.log(`    Title:    ${preview.title}`);
    if (preview.message) console.log(`    Message:  ${preview.message}`);
  }
  console.log();
}

/** Auto-paginate: fetch all pages, accumulating results. */
async function fetchAllPages<T>(
  fetcher: (cursor: string) => Promise<{ list_complete: boolean; cursor: string | null; items: T[] }>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor = "";
  while (true) {
    const page = await fetcher(cursor);
    all.push(...page.items);
    if (page.list_complete || !page.cursor) break;
    cursor = page.cursor;
  }
  return all;
}

/** Cached user ID for the session — avoids redundant whoami calls. */
let _cachedUid: string | null = null;

async function getUid(): Promise<string> {
  if (_cachedUid) return _cachedUid;
  const user = await whoami();
  _cachedUid = String(user.user_id);
  return _cachedUid;
}

/** Generate shell completion script for bash or zsh. */
function generateCompletion(shell: "bash" | "zsh"): string {
  const TOP_CMDS = ["login", "logout", "whoami", "version", "update", "token", "config", "completion", "link", "doc", "mem", "mcp"];
  const LINK_SUBS = ["create", "get", "list", "stats", "delete", "update"];
  const DOC_SUBS = ["upload", "list", "get", "delete", "update", "renew", "expire"];
  const MEM_SUBS = ["remember", "recall", "forget", "list", "stats", "session", "doc"];
  const ALL = [...TOP_CMDS, ...LINK_SUBS.map(s => `link_${s}`), ...DOC_SUBS.map(s => `doc_${s}`), ...MEM_SUBS.map(s => `mem_${s}`), "landing_create", "help"];

  if (shell === "bash") {
    return `# enke bash completion — source this file or add to ~/.bash_completion
_enke_completion() {
  local cur prev words cword
  _init_completion || return
  COMPREPLY=()

  case $cword in
    1)
      COMPREPLY=($(compgen -W "${TOP_CMDS.join(" ")} help" -- "$cur"))
      ;;
    2)
      case $prev in
        link)   COMPREPLY=($(compgen -W "${LINK_SUBS.join(" ")}" -- "$cur")) ;;
        doc)    COMPREPLY=($(compgen -W "${DOC_SUBS.join(" ")}" -- "$cur")) ;;
        token)  COMPREPLY=($(compgen -W "info" -- "$cur")) ;;
        config) COMPREPLY=($(compgen -W "show clear" -- "$cur")) ;;
        landing) COMPREPLY=($(compgen -W "create" -- "$cur")) ;;
        mem)    COMPREPLY=($(compgen -W "${MEM_SUBS.join(" ")}" -- "$cur")) ;;
        completion) COMPREPLY=($(compgen -W "bash zsh" -- "$cur")) ;;
      esac
      ;;
  esac
}
complete -F _enke_completion enke`;
  }

  // zsh
  return `#compdef enke
# enke zsh completion — place in a directory in $fpath

_enke() {
  local -a top_cmds link_subs doc_subs mem_subs
  top_cmds=(${TOP_CMDS.join(" ")} help)
  link_subs=(${LINK_SUBS.join(" ")})
  doc_subs=(${DOC_SUBS.join(" ")})
  mem_subs=(${MEM_SUBS.join(" ")})

  _arguments -C \\
    "1:command:(${TOP_CMDS.join(" ")} help)" \\
    "*::arg:->args"

  case $words[1] in
    link)
      _arguments "2:subcommand:(${LINK_SUBS.join(" ")})"
      ;;
    doc)
      _arguments "2:subcommand:(${DOC_SUBS.join(" ")})"
      ;;
    token)
      _arguments "2:subcommand:(info)"
      ;;
    config)
      _arguments "2:subcommand:(show clear)"
      ;;
    landing)
      _arguments "2:subcommand:(create)"
      ;;
    mem)
      _arguments "2:subcommand:(${MEM_SUBS.join(" ")})"
      ;;
    completion)
      _arguments "2:shell:(bash zsh)"
      ;;
  esac
}
_enke "$@"`;
}

async function checkLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch("https://registry.npmjs.org/enke-cli/latest", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const args = getPositionalArgs();
  const opts = parseArgs();
  const cmd = args[0];

  // Global flags
  VERBOSE = opts.verbose === "true";
  const json = isJson(opts);

  if (VERBOSE) {
    const { API_URL } = await import("enke-sdk");
    debug("API_URL =", API_URL);
  }

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    help();
    return;
  }

  try {
    switch (cmd) {
      case "login": {
        console.log("Opening browser for login...");
        const cfg = await login();
        console.log(`✓ Logged in. Token valid until ${new Date(cfg.expiresAt * 1000).toLocaleString()}`);
        process.exit(0);
      }
      case "logout": {
        logout();
        console.log("✓ Logged out.");
        break;
      }
      case "whoami": {
        const user = await whoami();
        if (json) {
          console.log(JSON.stringify(user, null, 2));
        } else {
          console.log(`  Email:  ${user.email}`);
          console.log(`  Name:   ${user.username}`);
          console.log(`  Plan:   ${user.planName} (${user.plan})`);
          console.log(`  Role:   ${user.role}`);
        }
        break;
      }

      case "token": {
        const sub = args[1];
        if (sub !== "info") { console.error("Usage: enke token info [--json]"); process.exit(1); }
        const cfg = loadConfig();
        if (!cfg) { console.error("Not logged in."); process.exit(1); }
        const token = await getToken();
        const now = Math.floor(Date.now() / 1000);
        const remaining = cfg.expiresAt - now;
        const info = {
          apiUrl: cfg.apiUrl,
          userApiUrl: cfg.userApiUrl,
          expiresAt: new Date(cfg.expiresAt * 1000).toISOString(),
          expiresIn: `${remaining}s (${Math.round(remaining / 60)}m)`,
          hasRefreshToken: !!cfg.refreshToken,
          tokenValid: !!token,
        };
        if (json) {
          console.log(JSON.stringify(info, null, 2));
        } else {
          console.log(`  API URL:       ${info.apiUrl}`);
          console.log(`  User API:      ${info.userApiUrl}`);
          console.log(`  Expires:       ${info.expiresAt}`);
          console.log(`  Remaining:     ${info.expiresIn}`);
          console.log(`  Refresh token: ${info.hasRefreshToken ? "yes" : "no"}`);
        }
        break;
      }

      case "config": {
        const sub = args[1];
        if (!sub || sub === "show") {
          const cfg = loadConfig();
          if (!cfg) { console.error("Not logged in. No config found."); process.exit(1); }
          if (json) {
            // Redact tokens for security
            console.log(JSON.stringify({
              apiUrl: cfg.apiUrl,
              userApiUrl: cfg.userApiUrl,
              expiresAt: new Date(cfg.expiresAt * 1000).toISOString(),
              tokenPrefix: cfg.token.substring(0, 20) + "...",
              hasRefreshToken: !!cfg.refreshToken,
              configFile: "[XDG_CONFIG_HOME]/enke/config.json",
            }, null, 2));
          } else {
            console.log(`  API URL:       ${cfg.apiUrl}`);
            console.log(`  User API:      ${cfg.userApiUrl}`);
            console.log(`  Expires:       ${new Date(cfg.expiresAt * 1000).toISOString()}`);
            console.log(`  Token:         ${cfg.token.substring(0, 20)}...`);
            console.log(`  Refresh token: ${cfg.refreshToken ? cfg.refreshToken.substring(0, 20) + "..." : "none"}`);
          }
          break;
        }
        if (sub === "clear") {
          clearConfig();
          console.log("✓ Config cleared.");
          break;
        }
        console.error("Usage: enke config <show|clear>");
        process.exit(1);
      }

      case "completion": {
        const shell = args[1] as "bash" | "zsh" | undefined;
        if (!shell || !["bash", "zsh"].includes(shell)) {
          console.error("Usage: enke completion <bash|zsh>");
          process.exit(1);
        }
        console.log(generateCompletion(shell));
        break;
      }

      case "version": {
        if (opts.json === "true") {
          console.log(JSON.stringify({ name: pkg.name, version: VERSION }));
        } else {
          console.log(`enke-cli ${VERSION}`);
        }
        break;
      }

      case "update": {
        const latest = await checkLatestVersion();
        const upToDate = !latest || latest === VERSION;

        if (opts.json === "true") {
          console.log(JSON.stringify({
            name: pkg.name,
            current: VERSION,
            latest: latest ?? "unknown",
            upToDate,
          }));
        } else if (upToDate) {
          console.log(`✓ enke-cli is up to date (${VERSION}).`);
        } else {
          console.log(`enke-cli ${VERSION} → ${latest} available.`);
          console.log(`Run: npm install -g enke-cli`);
        }
        break;
      }

      // ── link ──
      case "link": {
        const sub = args[1];
        const target = args[2];
        if (!sub) { console.error("Usage: enke link <create|get|list|stats|delete|update> [...]"); process.exit(1); }

        switch (sub) {
          case "create": {
            if (!target) { console.error("Usage: enke link create <url> [--slug x] [--keep-days 30] [--password x]"); process.exit(1); }
            const link = await shorten(target, {
              slug: opts.slug,
              password: opts.password,
              keep_days: opts["keep-days"] ? parseInt(opts["keep-days"]) : undefined,
            });
            if (json) { console.log(JSON.stringify(link, null, 2)); }
            else { console.log(`✓ Link created:`); printLink(link); }
            break;
          }
          case "get": {
            if (!target) { console.error("Usage: enke link get <slug> [--json]"); process.exit(1); }
            const link = await getLink(target);
            if (json) { console.log(JSON.stringify(link, null, 2)); }
            else { printLinkDetail(link as unknown as Record<string, unknown>); }
            break;
          }
          case "list": {
            const fetchAll = opts.all === "true";
            if (fetchAll) {
              const uid = await getUid();
              const links = await fetchAllPages(async (cursor) => {
                const r = await listLinks({ uid, cursor });
                return { list_complete: r.list_complete, cursor: r.cursor, items: r.links };
              });
              if (json) { console.log(JSON.stringify(links, null, 2)); }
              else {
                if (links.length === 0) { console.log("No links yet."); break; }
                console.log(`Links (${links.length} total):\n`);
                for (const l of links) printLink(l);
              }
            } else {
              const uid = await getUid();
              const result = await listLinks({ uid, cursor: opts.cursor });
              if (json) {
                console.log(JSON.stringify(result, null, 2));
              } else {
                if (result.links.length === 0) { console.log("No links yet."); break; }
                console.log(`Links (${result.links.length})${!result.list_complete ? " (more available)" : ""}${result.cursor ? ` — next: --cursor ${result.cursor}` : ""}:\n`);
                for (const l of result.links) printLink(l);
              }
            }
            break;
          }
          case "stats": {
            if (!target) { console.error("Usage: enke link stats <slug> [--json]"); process.exit(1); }
            const uid = await getUid();
            const stats = await getLinkStats(target, uid);
            if (json) {
              console.log(JSON.stringify(stats, null, 2));
            } else {
              console.log(`Stats for "${target}":`);
              console.log(`  Total visits:     ${stats.overview.total_visits}`);
              console.log(`  Unique countries: ${stats.overview.unique_countries}`);
              console.log(`  Unique referers:  ${stats.overview.unique_referers}`);
              if (stats.time_series.length > 0) {
                console.log(`  Daily:`);
                for (const d of stats.time_series.slice(-7)) console.log(`    ${d.date}: ${d.visits}`);
              }
              if (stats.top_referers.length > 0) {
                console.log(`  Top referrers:`);
                for (const r of stats.top_referers.slice(0, 5)) console.log(`    ${r.label}: ${r.count}`);
              }
              if (stats.top_countries.length > 0) {
                console.log(`  Top countries:`);
                for (const c of stats.top_countries.slice(0, 5)) console.log(`    ${c.label}: ${c.count}`);
              }
              if (stats.devices.length > 0) {
                console.log(`  Devices:`);
                for (const d of stats.devices) console.log(`    ${d.label}: ${d.count}`);
              }
            }
            break;
          }
          case "delete": {
            if (!target) { console.error("Usage: enke link delete <slug>"); process.exit(1); }
            await deleteLink(target);
            console.log(`✓ Link "${target}" deleted.`);
            break;
          }
          case "update": {
            if (!target) { console.error("Usage: enke link update <slug> [--url x] [--password x]"); process.exit(1); }
            if (!opts.url && opts.password === undefined) {
              console.error("At least one of --url or --password is required.");
              process.exit(1);
            }
            const updated = await updateLink(target, {
              url: opts.url,
              password: opts.password,
            });
            if (json) { console.log(JSON.stringify(updated, null, 2)); }
            else { console.log(`✓ Link updated:`); printLink(updated); }
            break;
          }
          default: {
            console.error(`Unknown sub-command: link ${sub}`);
            console.error("Usage: enke link <create|get|list|stats|delete|update>");
            process.exit(1);
          }
        }
        break;
      }

      // ── landing ──
      case "landing": {
        const sub = args[1];
        if (sub !== "create") { console.error("Usage: enke landing create <slug> <title> [--links url1,title1;url2,title2]"); process.exit(1); }
        const slug = args[2];
        const title = args[3];
        if (!slug || !title) { console.error("Usage: enke landing create <slug> <title>"); process.exit(1); }
        const linksRaw = opts.links ?? "";
        const links = linksRaw.split(";").filter(Boolean).map(pair => {
          const [url, label] = pair.split(",").map(s => s.trim());
          return { url, title: label ?? url };
        });
        const lp = await createLanding({ slug, title, links });
        console.log(`✓ Landing page created:`);
        console.log(`  Title:  ${lp.title}`);
        console.log(`  Slug:   ${lp.slug}`);
        console.log(`  Links:  ${lp.links.length}`);
        break;
      }

      // ── doc ──
      case "doc": {
        const sub = args[1];
        const target = args[2];
        if (!sub) { console.error("Usage: enke doc <upload|list|get|delete|update|renew|expire> [...]"); process.exit(1); }

        const { uploadDoc, listDocs, getDoc, deleteDoc, updateDoc, renewDoc, editDocExpiration } = await import("enke-sdk");

        switch (sub) {
          case "upload": {
            if (!target) { console.error("Usage: enke doc upload <file-path> [--slug x] [--exp-days 30] [--password x] [--comment x] [--burn] [--no-download] [--max-downloads 5]"); process.exit(1); }
            const fs = await import("node:fs");
            const path = await import("node:path");
            const filePath = path.resolve(target);
            if (!fs.existsSync(filePath)) { console.error(`File not found: ${filePath}`); process.exit(1); }
            const filename = path.basename(filePath);
            const doc = await uploadDoc(filePath, filename, {
              slug: opts.slug,
              exp_days: opts["exp-days"] ? parseInt(opts["exp-days"]) : undefined,
              password: opts.password,
              comment: opts.comment,
              burn_after_reading: opts.burn === "true",
              disable_download: opts["no-download"] === "true",
              max_downloads: opts["max-downloads"] ? parseInt(opts["max-downloads"]) : undefined,
            });
            if (json) {
              console.log(JSON.stringify(doc, null, 2));
            } else {
              console.log(`✓ Document uploaded:`);
              console.log(`  Slug:     ${doc.slug}`);
              console.log(`  URL:      https://en.ke/${doc.slug}`);
              console.log(`  File:     ${doc.filename} (${(doc.size / 1024).toFixed(1)} KB)`);
              console.log(`  Expires:  ${doc.exp_days} days`);
            }
            break;
          }
          case "list": {
            const fetchAll = opts.all === "true";
            if (fetchAll) {
              const docs = await fetchAllPages(async (cursor) => {
                const r = await listDocs(cursor, DEFAULT_PAGE_SIZE);
                return { list_complete: r.list_complete, cursor: r.cursor, items: r.docs };
              });
              if (json) { console.log(JSON.stringify(docs, null, 2)); }
              else {
                if (docs.length === 0) { console.log("No documents yet."); break; }
                console.log(`Documents (${docs.length} total):\n`);
                for (const d of docs) {
                  console.log(`  Slug:     ${d.slug}`);
                  console.log(`  File:     ${d.filename} (${(d.size / 1024).toFixed(1)} KB)`);
                  console.log(`  Views:    ${d.view_count}  Downloads: ${d.download_count}/${d.max_downloads || "∞"}`);
                  if (d.burn_after_reading) console.log(`  Burn:     after first download`);
                  if (d.password) console.log(`  Lock:     password protected`);
                  console.log();
                }
              }
            } else {
              const result = await listDocs(opts.cursor, opts.limit ? parseInt(opts.limit) : DEFAULT_PAGE_SIZE);
              if (json) {
                console.log(JSON.stringify(result, null, 2));
              } else {
                if (result.docs.length === 0) { console.log("No documents yet."); break; }
                console.log(`Documents (${result.docs.length})${!result.list_complete ? " (more available)" : ""}:\n`);
                for (const d of result.docs) {
                  console.log(`  Slug:     ${d.slug}`);
                  console.log(`  File:     ${d.filename} (${(d.size / 1024).toFixed(1)} KB)`);
                  console.log(`  Views:    ${d.view_count}  Downloads: ${d.download_count}/${d.max_downloads || "∞"}`);
                  if (d.burn_after_reading) console.log(`  Burn:     after first download`);
                  if (d.password) console.log(`  Lock:     password protected`);
                  console.log();
                }
              }
            }
            break;
          }
          case "get": {
            if (!target) { console.error("Usage: enke doc get <slug> [--json]"); process.exit(1); }
            const d = await getDoc(target);
            console.log(JSON.stringify(d, null, 2));
            break;
          }
          case "delete": {
            if (!target) { console.error("Usage: enke doc delete <slug>"); process.exit(1); }
            await deleteDoc(target);
            console.log(`✓ Document "${target}" deleted.`);
            break;
          }
          case "update": {
            if (!target) { console.error("Usage: enke doc update <slug> [--slug x] [--exp-days 30] [--password x] [--comment x] [--burn] [--no-download] [--max-downloads 5]"); process.exit(1); }
            const updated = await updateDoc(target, {
              exp_days: opts["exp-days"] ? parseInt(opts["exp-days"]) : undefined,
              password: opts.password,
              comment: opts.comment,
              burn_after_reading: opts.burn === "true" ? true : opts.burn === "false" ? false : undefined,
              disable_download: opts["no-download"] === "true" ? true : opts["no-download"] === "false" ? false : undefined,
              max_downloads: opts["max-downloads"] ? parseInt(opts["max-downloads"]) : undefined,
            });
            if (json) { console.log(JSON.stringify(updated, null, 2)); }
            else { console.log(`✓ Document updated: ${updated.slug}`); }
            break;
          }
          case "renew": {
            if (!target) { console.error("Usage: enke doc renew <slug>"); process.exit(1); }
            const renewed = await renewDoc(target);
            if (json) { console.log(JSON.stringify(renewed, null, 2)); }
            else { console.log(`✓ Document renewed: ${renewed.slug} (${renewed.exp_days} days)`); }
            break;
          }
          case "expire": {
            const days = args[3];
            if (!target || !days) { console.error("Usage: enke doc expire <slug> <days>"); process.exit(1); }
            const exp = await editDocExpiration(target, parseInt(days));
            if (json) { console.log(JSON.stringify(exp, null, 2)); }
            else { console.log(`✓ Expiration set to ${parseInt(days)} days for ${exp.slug}`); }
            break;
          }
          default: {
            console.error(`Unknown sub-command: doc ${sub}`);
            console.error("Usage: enke doc <upload|list|get|delete|update|renew|expire>");
            process.exit(1);
          }
        }
        break;
      }

      // ── mem ──
      case "mem": {
        const sub = args[1];
        if (!sub) { console.error("Usage: enke mem <remember|recall|forget|list|stats|session|doc> [...]"); process.exit(1); }

        const mem = new MemClient();

        switch (sub) {
          case "remember": {
            const content = args[2];
            if (!content) { console.error("Usage: enke mem remember <content> [--type semantic|episodic|procedural] [--ttl buffer|working|permanent] [--importance 0.5] [--tags tag1,tag2]"); process.exit(1); }

            const tags = opts.tags ? opts.tags.split(",").map(t => t.trim()) : undefined;
            const m = await mem.remember({
              content,
              memory_type: (opts.type as "semantic" | "episodic" | "procedural") ?? "semantic",
              ttl_level: (opts.ttl as "buffer" | "working" | "permanent") ?? "working",
              importance: opts.importance ? parseFloat(opts.importance) : 0.5,
              ...(tags ? { tags } : {}),
            });

            if (json) { console.log(JSON.stringify(m, null, 2)); }
            else {
              console.log(`✓ Memory stored: ${m.id}`);
              console.log(`  Type: ${m.memory_type} | TTL: ${m.ttl_level} | Importance: ${m.importance}`);
              console.log(`  ${m.content}`);
            }
            break;
          }

          case "recall": {
            const query = args[2];
            if (!query) { console.error("Usage: enke mem recall <query> [--limit 10] [--type semantic] [--threshold 0.5]"); process.exit(1); }

            const results = await mem.recall(query, {
              memory_type: opts.type as "semantic" | "episodic" | "procedural" | undefined,
              limit: opts.limit ? parseInt(opts.limit) : 10,
              threshold: opts.threshold ? parseFloat(opts.threshold) : undefined,
            });

            if (json) { console.log(JSON.stringify(results, null, 2)); }
            else {
              if (results.results.length === 0) { console.log("No matching memories found."); }
              else {
                console.log(`Found ${results.count} memories:\n`);
                for (const m of results.results) {
                  console.log(`  [${m.id}] ${m.memory_type} | ${m.ttl_level} | importance:${m.importance}`);
                  console.log(`  ${m.content}\n`);
                }
              }
            }
            break;
          }

          case "forget": {
            const id = args[2];
            if (!id) { console.error("Usage: enke mem forget <memory-id>"); process.exit(1); }
            const result = await mem.forget(id);
            if (json) { console.log(JSON.stringify(result, null, 2)); }
            else { console.log(`✓ Memory ${id} forgotten.`); }
            break;
          }

          case "list": {
            const results = await mem.list({
              memory_type: opts.type,
              limit: opts.limit ? parseInt(opts.limit) : 50,
            });

            if (json) { console.log(JSON.stringify(results, null, 2)); }
            else {
              if (results.results.length === 0) { console.log("No memories stored yet."); }
              else {
                console.log(`Memories (${results.count}):\n`);
                for (const m of results.results) {
                  console.log(`  ${m.id} | ${m.memory_type} | ${m.ttl_level} | ${m.created_at}`);
                  console.log(`  ${m.content.slice(0, 80)}${m.content.length > 80 ? "..." : ""}\n`);
                }
              }
            }
            break;
          }

          case "stats": {
            const stats = await mem.stats();
            if (json) { console.log(JSON.stringify(stats, null, 2)); }
            else {
              console.log(`Total: ${stats.total} (active: ${stats.active}, archived: ${stats.archived})`);
              console.log(`By type:  ${Object.entries(stats.by_type).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`);
              console.log(`By TTL:   ${Object.entries(stats.by_ttl).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`);
            }
            break;
          }

          case "session": {
            const sessionSub = args[2];
            if (!sessionSub) { console.error("Usage: enke mem session <create|context> [...]"); process.exit(1); }

            switch (sessionSub) {
              case "create": {
                const session = await mem.createSession(opts.agent);
                if (json) { console.log(JSON.stringify(session, null, 2)); }
                else { console.log(`✓ Session created: ${session.id} (${session.status})`); }
                break;
              }
              case "context": {
                const sessionId = args[3];
                if (!sessionId) { console.error("Usage: enke mem session context <session-id> [--limit 10]"); process.exit(1); }
                const ctx = await mem.assembleContext(sessionId, opts.limit ? parseInt(opts.limit) : 10);
                if (json) { console.log(JSON.stringify(ctx, null, 2)); }
                else {
                  console.log(`Session: ${ctx.session_id}`);
                  console.log(`Active: ${ctx.active_memories.length} | Recalled: ${ctx.recalled_memories.length} | ~${ctx.token_estimate} tokens`);
                }
                break;
              }
              default:
                console.error("Usage: enke mem session <create|context>");
                process.exit(1);
            }
            break;
          }

          case "doc": {
            const docSub = args[2];
            if (!docSub) { console.error("Usage: enke mem doc <upload|search|list> [...]"); process.exit(1); }

            switch (docSub) {
              case "upload": {
                const filePath = args[3];
                if (!filePath) { console.error("Usage: enke mem doc upload <file-path> [--name filename]"); process.exit(1); }
                const fs = await import("node:fs");
                const path = await import("node:path");
                const resolved = path.resolve(filePath);
                if (!fs.existsSync(resolved)) { console.error(`File not found: ${resolved}`); process.exit(1); }
                const filename = opts.name ?? path.basename(resolved);
                const content = fs.readFileSync(resolved, "utf-8");
                const doc = await mem.uploadDoc(filename, content);
                if (json) { console.log(JSON.stringify(doc, null, 2)); }
                else { console.log(`✓ Document uploaded: ${doc.id} (${doc.filename}, ${doc.chunk_count} chunks, ${doc.status})`); }
                break;
              }
              case "search": {
                const query = args[3];
                if (!query) { console.error("Usage: enke mem doc search <query> [--limit 5]"); process.exit(1); }
                const results = await mem.searchDocs(query, { limit: opts.limit ? parseInt(opts.limit) : 10 });
                if (json) { console.log(JSON.stringify(results, null, 2)); }
                else {
                  if (results.results.length === 0) { console.log("No matching documents found."); }
                  else {
                    console.log(`Found ${results.count} chunks:\n`);
                    for (const r of results.results) {
                      console.log(`  [${r.filename}] chunk ${r.chunk_index} | score: ${r.score.toFixed(3)}`);
                      console.log(`  ${r.content.slice(0, 120)}${r.content.length > 120 ? "..." : ""}\n`);
                    }
                  }
                }
                break;
              }
              case "list": {
                const docs = await mem.listDocs();
                if (json) { console.log(JSON.stringify(docs, null, 2)); }
                else {
                  if (docs.documents.length === 0) { console.log("No documents uploaded yet."); }
                  else {
                    console.log(`Documents (${docs.count}):\n`);
                    for (const d of docs.documents) {
                      console.log(`  ${d.id} | ${d.filename} | ${d.status} | ${d.chunk_count} chunks | ${d.created_at}`);
                    }
                  }
                }
                break;
              }
              default:
                console.error("Usage: enke mem doc <upload|search|list>");
                process.exit(1);
            }
            break;
          }

          default: {
            console.error(`Unknown sub-command: mem ${sub}`);
            console.error("Usage: enke mem <remember|recall|forget|list|stats|session|doc>");
            process.exit(1);
          }
        }
        break;
      }

      // ── mcp ──
      case "mcp": {
        const { runMcp } = await import("./mcp.js");
        await runMcp();
        break;
      }

      default: {
        console.error(`Unknown command: ${cmd}`);
        console.error("Run 'enke help' for usage.");
        process.exit(1);
      }
    }
  } catch (err) {
    if (err instanceof EnkeError) {
      printError(err, json);
      if (err.statusCode === 401) console.error("Run 'enke login' to authenticate.");
      else if (err.statusCode === 402) console.error("This feature requires a paid plan. Visit https://www.en.ke/pricing to upgrade.");
      else if (err.statusCode === 429) console.error("Quota exceeded. Upgrade your plan at https://www.en.ke/pricing for higher limits.");
    } else {
      printError(err, json);
    }
    process.exit(1);
  }
}

// Only auto-execute when run as a script (not when imported for testing).
// Uses realpathSync to resolve symlinks (e.g. /opt/homebrew/bin/enke → .../dist/cli.js).
const isMainModule = (() => {
  if (!process.argv[1]) return false;
  try {
    const real = realpathSync(process.argv[1]);
    return import.meta.url.endsWith(real.replace(/\\/g, '/'));
  } catch {
    // If realpath fails (e.g., file doesn't exist), fall back to argv[1]
    return import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
  }
})();

if (isMainModule) {
  // Quick check for login state on any command except those that don't need auth
  const cmd = process.argv[2];
  if (cmd && !["login", "logout", "help", "--help", "-h", "version", "update", "completion"].includes(cmd)) {
    const cfg = loadConfig();
    if (!cfg) {
      // Distinguish corrupt config from missing config
      const configDir = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "enke");
      const configFile = join(configDir, "config.json");
      if (existsSync(configFile)) {
        console.error(`Config file exists but could not be parsed: ${configFile}`);
        console.error("The file may be corrupted. Run 'enke config clear' to reset, then 'enke login'.");
      } else {
        console.error("Not logged in. Run 'enke login' first.");
      }
      process.exit(1);
    }
  }

  main();
}
