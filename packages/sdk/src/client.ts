import { getToken, API_URL } from "./auth.js";
import type {
  ShortLink, ShortenOptions, UpdateOptions, ListFilter,
  LinkStats, LandingPage, LandingOptions, UserInfo,
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
  const data = await request<{ data: UserInfo }>("GET", "/api/v1/me");
  return data.data;
}

export { EnkeError };
