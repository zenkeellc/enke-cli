/**
 * enke MCP Server (merged into enke-cli)
 *
 * Exposes en.ke link + doc + mem tools to AI agents via the Model Context Protocol.
 * Run via: enke mcp
 *
 * Transport modes:
 *   local (default):  stdio — for Claude Desktop, Cursor, etc.
 *   remote:           SSE   — set ENKE_MCP_TRANSPORT=sse ENKE_MCP_PORT=3100
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import {
  shorten, listLinks, deleteLink, updateLink, getLinkStats,
  createLanding, getToken, EnkeError,
  uploadDoc, listDocs, getDoc, deleteDoc, updateDoc, renewDoc,
  whoami,
  MemClient,
} from "enke-sdk";
import http from "node:http";

// ── Helpers ──

let _cachedUid: string | null = null;
async function getUid(): Promise<string> {
  if (_cachedUid) return _cachedUid;
  const user = await whoami();
  _cachedUid = String(user.user_id);
  return _cachedUid;
}

function wrapTool<T>(
  fn: (input: T) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
) {
  return async (input: T): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
    try {
      return await fn(input);
    } catch (err) {
      let text: string;
      if (err instanceof EnkeError) {
        text = err.message;
        const details: string[] = [];
        if (err.errorCode) details.push(`code: ${err.errorCode}`);
        if (err.statusCode) details.push(`status: ${err.statusCode}`);
        if (err.params) {
          const paramStr = Object.entries(err.params)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ");
          if (paramStr) details.push(`params: {${paramStr}}`);
        }
        if (details.length > 0) text += ` (${details.join("; ")})`;
      } else {
        text = err instanceof Error ? err.message : String(err);
      }
      return { content: [{ type: "text" as const, text }] };
    }
  };
}

// ── Schemas ──

const ShortenSchema = z.object({
  url: z.string().url().describe("The long URL to shorten"),
  slug: z.string().min(1).optional().describe("Custom short slug (back-half). Auto-generated if omitted."),
  password: z.string().min(1).optional().describe("Optional password to protect the link"),
  keep_days: z.number().min(1).max(3650).default(30).describe("Keep duration in days (default 30, plan-dependent max)"),
});

const ListLinksSchema = z.object({
  cursor: z.string().optional().describe("Pagination cursor (empty for first page)"),
});

const LinkIdSchema = z.object({
  id: z.string().describe("The slug or ID of the short link"),
});

const UpdateLinkSchema = z.object({
  id: z.string().describe("The slug or ID of the short link to update"),
  url: z.string().url().optional().describe("New redirect URL"),
  password: z.string().optional().describe("New password (empty string to remove)"),
});

const CreateLandingSchema = z.object({
  slug: z.string().min(1).describe("Custom slug for the landing page (required)"),
  title: z.string().min(1).describe("Title of the landing page"),
  description: z.string().optional().describe("Description shown under the title"),
  links: z.array(z.object({
    url: z.string().url(),
    title: z.string().min(1),
  })).describe("Array of {url, title} pairs"),
  theme: z.object({
    background: z.enum(["light", "dark", "gradient"]).optional(),
    layout: z.enum(["gallery", "terminal", "magazine", "matrix", "anime"]).optional(),
    accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  }).optional().describe("Visual theme settings"),
});

const DocUploadSchema = z.object({
  file_path: z.string().describe("Absolute path to the file to upload"),
  exp_days: z.number().min(1).max(3650).default(30).describe("Expiration in days (plan-dependent max)"),
  password: z.string().min(4).optional().describe("Password to protect the document"),
  comment: z.string().optional().describe("Owner-facing note or label"),
  burn_after_reading: z.boolean().default(false).describe("Delete after first download"),
  disable_download: z.boolean().default(false).describe("Preview only, no download button"),
  max_downloads: z.number().min(0).default(0).describe("Max downloads (0 = unlimited)"),
});

const DocListSchema = z.object({
  cursor: z.string().optional().describe("Pagination cursor"),
  limit: z.number().min(1).max(100).default(20).describe("Items per page"),
});

const DocIdSchema = z.object({
  slug: z.string().describe("Document short slug"),
});

const DocUpdateSchema = z.object({
  slug: z.string().describe("Document short slug"),
  exp_days: z.number().min(1).max(3650).optional().describe("New expiration in days"),
  password: z.string().optional().describe("New password (empty to remove)"),
  comment: z.string().optional().describe("New comment"),
  burn_after_reading: z.boolean().optional(),
  disable_download: z.boolean().optional(),
  max_downloads: z.number().min(0).optional(),
});

// ── Mem Schemas ──

const MemRememberSchema = z.object({
  content: z.string().min(1).describe("The memory content to store"),
  memory_type: z.enum(["semantic", "episodic", "procedural"]).default("semantic").describe("Memory type"),
  importance: z.number().min(0).max(1).default(0.5).describe("Importance score (0-1)"),
  ttl_level: z.enum(["buffer", "working", "permanent"]).default("working").describe("TTL tier: buffer (24h), working (7d), permanent (never)"),
});

const MemRecallSchema = z.object({
  query: z.string().min(1).describe("Search query for semantic search"),
  memory_type: z.enum(["semantic", "episodic", "procedural"]).optional().describe("Filter by memory type"),
  limit: z.number().min(1).max(100).default(10).describe("Max results"),
  threshold: z.number().min(0).max(1).default(0.4).describe("Minimum similarity threshold"),
});

const MemForgetSchema = z.object({
  id: z.string().describe("The memory ID to forget"),
});

const MemListSchema = z.object({
  memory_type: z.enum(["semantic", "episodic", "procedural"]).optional().describe("Filter by type"),
  limit: z.number().min(1).max(100).default(50).describe("Max results"),
});

const DocSearchSchema = z.object({
  query: z.string().min(1).describe("Search query for document knowledge base"),
  limit: z.number().min(1).max(100).default(10).describe("Max results"),
});

// ── Server Setup ──

function createServer(): McpServer {
  const server = new McpServer({
    name: "enke-mcp-server",
    version: pkg.version,
    description: "en.ke — secure link & context relay for AI agents. Create, manage, and audit short links, documents, and agent memory.",
  });

  const mem = new MemClient();

  // ── Link Tools ──

  server.tool("shorten_url",
    "Create a short link from a long URL. Use this to share links, pass context between agents, or create temporary revocable references.",
    ShortenSchema.shape,
    wrapTool(async (input: z.infer<typeof ShortenSchema>) => {
      const link = await shorten(input.url, { slug: input.slug, password: input.password, keep_days: input.keep_days });
      return { content: [{ type: "text", text: JSON.stringify(link, null, 2) }] };
    }),
  );

  server.tool("list_links",
    "List your short links. Returns links with pagination support.",
    ListLinksSchema.shape,
    wrapTool(async (input: z.infer<typeof ListLinksSchema>) => {
      const uid = await getUid();
      const result = await listLinks({ uid, cursor: input.cursor });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }),
  );

  server.tool("get_link_stats",
    "Get click analytics for a specific short link: daily counts, referrers, geo distribution, and device types.",
    LinkIdSchema.shape,
    wrapTool(async (input: z.infer<typeof LinkIdSchema>) => {
      const uid = await getUid();
      const stats = await getLinkStats(input.id, uid);
      return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
    }),
  );

  server.tool("delete_link",
    "Permanently revoke and delete a short link. The link will stop redirecting immediately. This action is irreversible.",
    LinkIdSchema.shape,
    wrapTool(async (input: z.infer<typeof LinkIdSchema>) => {
      await deleteLink(input.id);
      return { content: [{ type: "text", text: `Link "${input.id}" has been deleted.` }] };
    }),
  );

  server.tool("update_link",
    "Update a short link's properties: change target URL or set/remove password.",
    UpdateLinkSchema.shape,
    wrapTool(async (input: z.infer<typeof UpdateLinkSchema>) => {
      const link = await updateLink(input.id, { url: input.url, password: input.password });
      return { content: [{ type: "text", text: JSON.stringify(link, null, 2) }] };
    }),
  );

  server.tool("create_landing",
    "Create a landing page (link-in-bio) with multiple links. Slug is required.",
    CreateLandingSchema.shape,
    wrapTool(async (input: z.infer<typeof CreateLandingSchema>) => {
      const lp = await createLanding({ slug: input.slug, title: input.title, description: input.description, links: input.links, theme: input.theme });
      return { content: [{ type: "text", text: JSON.stringify(lp, null, 2) }] };
    }),
  );

  // ── Document Tools ──

  server.tool("upload_document",
    "Upload and share a file. Returns a short URL for secure sharing with expiration, password, watermark, and burn-after-reading.",
    DocUploadSchema.shape,
    wrapTool(async (input: z.infer<typeof DocUploadSchema>) => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const filePath = path.resolve(input.file_path);
      if (!fs.existsSync(filePath)) {
        return { content: [{ type: "text" as const, text: `Error: File not found: ${filePath}` }] };
      }
      const filename = path.basename(filePath);
      const doc = await uploadDoc(filePath, filename, {
        exp_days: input.exp_days, password: input.password, comment: input.comment,
        burn_after_reading: input.burn_after_reading, disable_download: input.disable_download, max_downloads: input.max_downloads,
      });
      return { content: [{ type: "text" as const, text: `Uploaded: https://en.ke/${doc.slug}\n${JSON.stringify(doc, null, 2)}` }] };
    }),
  );

  server.tool("list_documents",
    "List all shared documents, newest first.",
    DocListSchema.shape,
    wrapTool(async (input: z.infer<typeof DocListSchema>) => {
      const result = await listDocs(input.cursor, input.limit);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );

  server.tool("get_document",
    "Get details of a specific shared document by slug.",
    DocIdSchema.shape,
    wrapTool(async (input: z.infer<typeof DocIdSchema>) => {
      const doc = await getDoc(input.slug);
      return { content: [{ type: "text" as const, text: JSON.stringify(doc, null, 2) }] };
    }),
  );

  server.tool("delete_document",
    "Permanently delete a shared document and its file. Irreversible.",
    DocIdSchema.shape,
    wrapTool(async (input: z.infer<typeof DocIdSchema>) => {
      await deleteDoc(input.slug);
      return { content: [{ type: "text" as const, text: `Document "${input.slug}" deleted.` }] };
    }),
  );

  server.tool("update_document",
    "Update a shared document's settings: expiration, password, download limits, burn-after-reading.",
    DocUpdateSchema.shape,
    wrapTool(async (input: z.infer<typeof DocUpdateSchema>) => {
      const doc = await updateDoc(input.slug, {
        exp_days: input.exp_days, password: input.password, comment: input.comment,
        burn_after_reading: input.burn_after_reading, disable_download: input.disable_download, max_downloads: input.max_downloads,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(doc, null, 2) }] };
    }),
  );

  server.tool("renew_document",
    "Reset a document's expiration timer to the plan's renewal period.",
    DocIdSchema.shape,
    wrapTool(async (input: z.infer<typeof DocIdSchema>) => {
      const doc = await renewDoc(input.slug);
      return { content: [{ type: "text" as const, text: `Renewed: ${doc.slug} (${doc.exp_days} days)` }] };
    }),
  );

  // ── Memory Tools ──

  server.tool("mem_remember",
    "Store a memory for later recall. Use this to remember facts, preferences, events, or workflows across sessions.",
    MemRememberSchema.shape,
    wrapTool(async (input: z.infer<typeof MemRememberSchema>) => {
      const memory = await mem.remember(input);
      return { content: [{ type: "text" as const, text: JSON.stringify(memory, null, 2) }] };
    }),
  );

  server.tool("mem_recall",
    "Search stored memories semantically. Returns relevant memories ranked by similarity. Returns empty if nothing matches.",
    MemRecallSchema.shape,
    wrapTool(async (input: z.infer<typeof MemRecallSchema>) => {
      const result = await mem.recall(input.query, { memory_type: input.memory_type, limit: input.limit, threshold: input.threshold });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );

  server.tool("mem_forget",
    "Remove a specific memory by its ID. The memory is soft-deleted (marked as forgotten).",
    MemForgetSchema.shape,
    wrapTool(async (input: z.infer<typeof MemForgetSchema>) => {
      const result = await mem.forget(input.id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    }),
  );

  server.tool("mem_list",
    "List stored memories, optionally filtered by type. Returns newest first.",
    MemListSchema.shape,
    wrapTool(async (input: z.infer<typeof MemListSchema>) => {
      const result = await mem.list({ memory_type: input.memory_type, limit: input.limit });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );

  server.tool("mem_stats",
    "Get memory statistics: total count, breakdown by type and TTL level.",
    z.object({}).shape,
    wrapTool(async () => {
      const stats = await mem.stats();
      return { content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }] };
    }),
  );

  server.tool("mem_doc_search",
    "Search uploaded documents for relevant context. Returns chunks with source citations.",
    DocSearchSchema.shape,
    wrapTool(async (input: z.infer<typeof DocSearchSchema>) => {
      const result = await mem.searchDocs(input.query, { limit: input.limit });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );

  return server;
}

// ── Auth ──

async function checkAuth(): Promise<boolean> {
  if (process.env.ENKE_API_KEY) return true;
  try {
    const token = await getToken();
    return token !== null;
  } catch {
    return false;
  }
}

// ── Transport Selection ──

const TRANSPORT = process.env.ENKE_MCP_TRANSPORT ?? "stdio";

async function runStdio(): Promise<void> {
  const originalLog = console.log;
  console.log = (...args: unknown[]) => console.error(...args);

  const authed = await checkAuth();
  if (!authed) {
    console.error("[enke-mcp] Not authenticated. Run 'enke login' first, or set ENKE_API_KEY.");
    process.exit(1);
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.log = originalLog;
  console.error("[enke-mcp] Running in local (stdio) mode");
}

async function runSSE(): Promise<void> {
  const port = parseInt(process.env.ENKE_MCP_PORT ?? "3100", 10);
  const transports = new Map<string, SSEServerTransport>();
  const server = createServer();

  const httpServer = http.createServer(async (req, res) => {
    const reqUrl = req.url ?? "/";

    if (reqUrl === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method === "GET" && reqUrl === "/sse") {
      const authed = process.env.ENKE_API_KEY
        ? true
        : !!(req.headers.authorization?.startsWith("Bearer "));
      if (!authed) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing Authorization: Bearer <token> header" }));
        return;
      }

      const transport = new SSEServerTransport("/message", res);
      transports.set(transport.sessionId, transport);
      transport.onclose = () => { transports.delete(transport.sessionId); };
      await server.connect(transport);
      return;
    }

    if (req.method === "POST" && reqUrl.startsWith("/message")) {
      const url = new URL(reqUrl, "http://127.0.0.1");
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing sessionId" }));
        return;
      }

      const transport = transports.get(sessionId);
      if (!transport) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unknown session" }));
        return;
      }

      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", async () => {
        try {
          const msg = JSON.parse(body);
          await transport.handlePostMessage(req, res, msg);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  httpServer.listen(port, () => {
    console.error(`[enke-mcp] Running in remote (SSE) mode on port ${port}`);
    console.error(`[enke-mcp] SSE endpoint:  http://localhost:${port}/sse`);
    console.error(`[enke-mcp] Health check:   http://localhost:${port}/health`);
  });
}

// ── Entry point (called from CLI) ──

export async function runMcp(): Promise<void> {
  if (TRANSPORT === "sse") {
    await runSSE();
  } else {
    await runStdio();
  }
}
