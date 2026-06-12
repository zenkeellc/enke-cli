import { getToken, API_URL } from "./auth.js";
import type {
  ShortLink, ShortenOptions, UpdateOptions, ListFilter, LinkListResponse,
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

// ── Helpers ──

/** Convert a Unix timestamp (seconds) to ISO string. */
function tsToIso(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

/** Transform an API link object to consumer-facing ShortLink. */
function toShortLink(raw: Record<string, unknown>): ShortLink {
  const ctime = (raw.ctime as number) ?? 0;
  const expDays = (raw.exp_days as number) ?? 30;

  return {
    uid: String(raw.uid ?? ""),
    id: String(raw.id ?? raw.slug ?? ""),
    url: String(raw.url ?? ""),
    slug: String(raw.slug ?? ""),
    shortUrl: `https://en.ke/${raw.slug}`,
    comment: raw.comment as string | undefined,
    ctime,
    mtime: (raw.mtime as number) ?? ctime,
    exp_days: expDays,
    password: raw.password as string | undefined,
    passwordProtected: !!raw.password,
    createdAt: ctime ? tsToIso(ctime) : "",
    expiresAt: ctime ? tsToIso(ctime + expDays * 86400) : null,
    title: raw.title as string | undefined,
    description: raw.description as string | undefined,
    image: raw.image as string | undefined,
    rules: raw.rules as ShortLink["rules"],
    ab_targets: raw.ab_targets as ShortLink["ab_targets"],
    preview: raw.preview as ShortLink["preview"],
  };
}

// ── Links ──

/** Create a new short link. */
export async function shorten(url: string, opts?: ShortenOptions): Promise<ShortLink> {
  const data = await request<{ success: boolean; link: Record<string, unknown> }>(
    "POST", "/api/v1/links",
    {
      url,
      ...(opts?.slug ? { slug: opts.slug } : {}),
      ...(opts?.keep_days ? { keep_days: opts.keep_days } : {}),
      ...(opts?.password ? { password: opts.password } : {}),
      ...(opts?.rules ? { rules: opts.rules } : {}),
      ...(opts?.ab_targets ? { ab_targets: opts.ab_targets } : {}),
      ...(opts?.preview ? { preview: opts.preview } : {}),
    },
  );
  return toShortLink(data.link);
}

/** List user's short links. uid is required by the API. */
export async function listLinks(filter: ListFilter): Promise<LinkListResponse> {
  const params = new URLSearchParams();
  params.set("uid", filter.uid);
  params.set("cursor", filter.cursor ?? "");
  const qs = params.toString();
  const data = await request<{
    list_complete: boolean;
    cursor: string | null;
    links: Record<string, unknown>[];
  }>("GET", `/api/v1/links?${qs}`);
  return {
    list_complete: data.list_complete,
    cursor: data.cursor,
    links: (data.links ?? []).map(toShortLink),
  };
}

/** Get a single short link by slug. */
export async function getLink(slug: string): Promise<ShortLink> {
  const data = await request<Record<string, unknown>>(
    "GET", `/api/v1/links/${encodeURIComponent(slug)}`,
  );
  return toShortLink(data);
}

/** Delete (revoke) a short link. */
export async function deleteLink(slug: string): Promise<void> {
  await request<unknown>("DELETE", `/api/v1/links/${encodeURIComponent(slug)}`);
}

/** Update a short link's properties. */
export async function updateLink(slug: string, opts: UpdateOptions): Promise<ShortLink> {
  const data = await request<{
    success: boolean;
    result: { link: Record<string, unknown> };
  }>(
    "PUT", `/api/v1/links/${encodeURIComponent(slug)}`,
    {
      ...(opts.url !== undefined ? { url: opts.url } : {}),
      ...(opts.password !== undefined ? { password: opts.password } : {}),
      ...(opts.rules !== undefined ? { rules: opts.rules } : {}),
      ...(opts.ab_targets !== undefined ? { ab_targets: opts.ab_targets } : {}),
      ...(opts.preview !== undefined ? { preview: opts.preview } : {}),
    },
  );
  return toShortLink(data.result.link);
}

/** Get click analytics for a link. */
export async function getLinkStats(slug: string, uid?: string): Promise<LinkStats> {
  const params = new URLSearchParams();
  if (uid) params.set("uid", uid);
  const qs = params.toString();
  const data = await request<LinkStats>(
    "GET", `/api/v1/link_stat/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`,
  );
  return data;
}

// ── Landing Pages ──

/** Create or update a landing page. */
export async function createLanding(opts: LandingOptions): Promise<LandingPage> {
  const data = await request<{
    success: boolean;
    result: { page: LandingPage };
  }>("POST", "/api/v1/landing", opts);
  return data.result.page;
}

// ── User ──

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
