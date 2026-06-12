import { getToken, API_URL } from "./auth.js";
import type {
  ShortLink, ShortenOptions, UpdateOptions, ListFilter,
  LinkStats, LandingPage, LandingOptions, UserInfo,
  DocShare, DocUploadOptions, DocUpdateOptions, DocListResponse,
} from "./types.js";

class EnkeError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "EnkeError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getToken();
  if (!token) throw new EnkeError("Not logged in. Run: enke login", 401);

  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "Unknown error");
    throw new EnkeError(msg, res.status);
  }

  return res.json() as T;
}

/** Create a new short link. */
export async function shorten(url: string, opts?: ShortenOptions): Promise<ShortLink> {
  const data = await request<{ data: ShortLink }>("POST", "/api/v1/links", {
    url,
    ...opts,
  });
  return data.data;
}

/** List user's short links. */
export async function listLinks(filter?: ListFilter): Promise<ShortLink[]> {
  const params = new URLSearchParams();
  if (filter?.limit) params.set("limit", String(filter.limit));
  if (filter?.offset) params.set("offset", String(filter.offset));
  if (filter?.search) params.set("search", filter.search);
  const qs = params.toString();
  const data = await request<{ data: ShortLink[] }>("GET", `/api/v1/links${qs ? `?${qs}` : ""}`);
  return data.data;
}

/** Get a single short link by slug or ID. */
export async function getLink(id: string): Promise<ShortLink> {
  const data = await request<{ data: ShortLink }>("GET", `/api/v1/links/${encodeURIComponent(id)}`);
  return data.data;
}

/** Delete (revoke) a short link. */
export async function deleteLink(id: string): Promise<void> {
  await request<unknown>("DELETE", `/api/v1/links/${encodeURIComponent(id)}`);
}

/** Update a short link's properties. */
export async function updateLink(id: string, opts: UpdateOptions): Promise<ShortLink> {
  const data = await request<{ data: ShortLink }>("PATCH", `/api/v1/links/${encodeURIComponent(id)}`, opts);
  return data.data;
}

/** Get click analytics for a link. */
export async function getLinkStats(id: string): Promise<LinkStats> {
  const data = await request<{ data: LinkStats }>("GET", `/api/v1/links/${encodeURIComponent(id)}/stats`);
  return data.data;
}

/** Create a landing page. */
export async function createLanding(opts: LandingOptions): Promise<LandingPage> {
  const data = await request<{ data: LandingPage }>("POST", "/api/v1/landing", opts);
  return data.data;
}

/** Get current user info. */
export async function whoami(): Promise<UserInfo> {
  return request<UserInfo>("GET", "/api/v1/me");
}

// ── Document Share ──

/** Upload a document for sharing. Takes file path; reads and streams it. */
export async function uploadDoc(
  filePath: string,
  filename: string,
  opts?: DocUploadOptions,
): Promise<DocShare> {
  const token = await getToken();
  if (!token) throw new EnkeError("Not logged in. Run: enke login", 401);

  // Build a simple multipart form manually to avoid DOM API dependencies
  const boundary = `----EnkeUpload${Math.random().toString(36).slice(2)}`;
  const fs = await import("node:fs");
  const content = fs.readFileSync(filePath);

  // Detect MIME type from file extension (supports 1000+ types)
  const mime = (await import("mime")).default;
  const contentType = mime.getType(filename) ?? 'application/octet-stream';

  const parts: Buffer[] = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
  parts.push(content);
  if (opts) {
    const metaJson = JSON.stringify(opts);
    parts.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metaJson}`));
  }
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  const res = await fetch(`${API_URL}/api/v1/docs`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "Unknown error");
    throw new EnkeError(msg, res.status);
  }

  const data = await res.json() as { success: boolean; result: { doc: DocShare } };
  return data.result.doc;
}

/** List documents. */
export async function listDocs(cursor?: string, limit?: number): Promise<DocListResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  const data = await request<DocListResponse>("GET", `/api/v1/docs${qs ? `?${qs}` : ""}`);
  return data;
}

/** Get a single document. */
export async function getDoc(slug: string): Promise<DocShare> {
  const data = await request<DocShare>("GET", `/api/v1/docs/${encodeURIComponent(slug)}`);
  return data;
}

/** Delete a document (irreversible). */
export async function deleteDoc(slug: string): Promise<void> {
  await request<unknown>("DELETE", `/api/v1/docs/${encodeURIComponent(slug)}`);
}

/** Update document settings. */
export async function updateDoc(slug: string, opts: DocUpdateOptions): Promise<DocShare> {
  const data = await request<{ success: boolean; result: { doc: DocShare } }>(
    "PUT", `/api/v1/docs/${encodeURIComponent(slug)}`, opts,
  );
  return data.result.doc;
}

/** Renew a document (reset expiration). */
export async function renewDoc(slug: string): Promise<DocShare> {
  const data = await request<{ success: boolean; result: { doc: DocShare } }>(
    "POST", `/api/v1/docs/${encodeURIComponent(slug)}/renew`,
  );
  return data.result.doc;
}

/** Edit document expiration days. */
export async function editDocExpiration(slug: string, expDays: number): Promise<DocShare> {
  const data = await request<{ success: boolean; result: { doc: DocShare } }>(
    "POST", `/api/v1/docs/${encodeURIComponent(slug)}/expiration`,
    { exp_days: expDays },
  );
  return data.result.doc;
}

export { EnkeError };
