import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getToken before importing the module under test
vi.mock("../auth.js", () => ({
  getToken: vi.fn(() => Promise.resolve("test-token")),
  API_URL: "https://api.en.ke",
}));

import {
  shorten,
  listLinks,
  getLink,
  deleteLink,
  updateLink,
  getLinkStats,
  createLanding,
  whoami,
  EnkeError,
} from "../client.js";

const { getToken } = await import("../auth.js");

// Helper to mock fetch for a sequence of responses
function mockFetch(status: number, body: unknown) {
  return vi.fn(() =>
    Promise.resolve({
      ok: status < 400,
      status,
      text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
      json: () => Promise.resolve(body),
    } as Response)
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ── shorten ──

describe("shorten", () => {
  it("creates a short link with minimal options", async () => {
    const link = {
      id: "abc123", slug: "my-link", url: "https://example.com",
      shortUrl: "https://en.ke/my-link", createdAt: "2026-01-01T00:00:00Z",
      expiresAt: null, clicks: 0, passwordProtected: false,
    };
    globalThis.fetch = mockFetch(201, { data: link });

    const result = await shorten("https://example.com");
    expect(result.slug).toBe("my-link");
    expect(result.shortUrl).toBe("https://en.ke/my-link");
    expect(result.url).toBe("https://example.com");
  });

  it("passes all options to the API", async () => {
    globalThis.fetch = mockFetch(201, { data: { id: "x", slug: "custom", url: "https://x.com", shortUrl: "https://en.ke/custom", createdAt: "", expiresAt: null, clicks: 0, passwordProtected: true } });
    await shorten("https://x.com", { slug: "custom", password: "pw", expiresIn: "7d", webhookUrl: "https://hook.com" });

    const callArgs = (globalThis.fetch as ReturnType<typeof mockFetch>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.slug).toBe("custom");
    expect(body.password).toBe("pw");
    expect(body.expiresIn).toBe("7d");
    expect(body.webhookUrl).toBe("https://hook.com");
  });

  it("throws EnkeError on API failure", async () => {
    globalThis.fetch = mockFetch(400, "Bad URL");
    await expect(shorten("not-a-url")).rejects.toThrow(EnkeError);
  });

  it("throws when not authenticated", async () => {
    vi.mocked(getToken).mockResolvedValueOnce(null);
    globalThis.fetch = mockFetch(200, { data: {} });
    await expect(shorten("https://x.com")).rejects.toThrow(EnkeError);
  });
});

// ── listLinks ──

describe("listLinks", () => {
  it("lists links with defaults", async () => {
    const links = [
      { id: "1", slug: "a", url: "https://a.com", shortUrl: "https://en.ke/a", createdAt: "", expiresAt: null, clicks: 5, passwordProtected: false },
      { id: "2", slug: "b", url: "https://b.com", shortUrl: "https://en.ke/b", createdAt: "", expiresAt: null, clicks: 3, passwordProtected: true },
    ];
    globalThis.fetch = mockFetch(200, { data: links });
    const result = await listLinks();
    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe("a");
  });

  it("passes limit and search params", async () => {
    globalThis.fetch = mockFetch(200, { data: [] });
    await listLinks({ limit: 5, search: "test" });
    const url = (globalThis.fetch as ReturnType<typeof mockFetch>).mock.calls[0][0] as string;
    expect(url).toContain("limit=5");
    expect(url).toContain("search=test");
  });

  it("returns empty array when no links", async () => {
    globalThis.fetch = mockFetch(200, { data: [] });
    const result = await listLinks();
    expect(result).toEqual([]);
  });
});

// ── getLink ──

describe("getLink", () => {
  it("fetches a single link by slug", async () => {
    const link = { id: "1", slug: "abc", url: "https://x.com", shortUrl: "https://en.ke/abc", createdAt: "", expiresAt: null, clicks: 0, passwordProtected: false };
    globalThis.fetch = mockFetch(200, { data: link });
    const result = await getLink("abc");
    expect(result.slug).toBe("abc");
  });

  it("throws on 404", async () => {
    globalThis.fetch = mockFetch(404, "Not found");
    await expect(getLink("nonexistent")).rejects.toThrow(EnkeError);
  });
});

// ── deleteLink ──

describe("deleteLink", () => {
  it("deletes a link successfully", async () => {
    globalThis.fetch = mockFetch(200, { success: true });
    await expect(deleteLink("abc")).resolves.toBeUndefined();
  });

  it("throws on non-existent slug", async () => {
    globalThis.fetch = mockFetch(404, "Not found");
    await expect(deleteLink("gone")).rejects.toThrow(EnkeError);
  });
});

// ── updateLink ──

describe("updateLink", () => {
  it("updates a link's slug", async () => {
    const updated = { id: "1", slug: "new-slug", url: "https://x.com", shortUrl: "https://en.ke/new-slug", createdAt: "", expiresAt: null, clicks: 0, passwordProtected: false };
    globalThis.fetch = mockFetch(200, { data: updated });
    const result = await updateLink("old-slug", { slug: "new-slug" });
    expect(result.slug).toBe("new-slug");
  });

  it("updates password and expiration", async () => {
    globalThis.fetch = mockFetch(200, { data: { id: "1", slug: "x", url: "https://x.com", shortUrl: "https://en.ke/x", createdAt: "", expiresAt: "2026-06-19T00:00:00Z", clicks: 0, passwordProtected: true } });
    const result = await updateLink("x", { password: "pw", expiresIn: "30d" });
    expect(result.passwordProtected).toBe(true);
    expect(result.expiresAt).toBeTruthy();
  });
});

// ── getLinkStats ──

describe("getLinkStats", () => {
  it("returns click analytics", async () => {
    const stats = {
      totalClicks: 42,
      daily: [{ date: "2026-06-12", count: 10 }],
      referrers: [{ source: "twitter.com", count: 5 }],
      geo: [{ country: "US", count: 20 }],
      devices: [{ type: "mobile", count: 15 }],
    };
    globalThis.fetch = mockFetch(200, { data: stats });
    const result = await getLinkStats("abc");
    expect(result.totalClicks).toBe(42);
    expect(result.daily).toHaveLength(1);
    expect(result.referrers).toHaveLength(1);
    expect(result.geo).toHaveLength(1);
    expect(result.devices).toHaveLength(1);
  });

  it("handles zero-click stats", async () => {
    globalThis.fetch = mockFetch(200, { data: { totalClicks: 0, daily: [], referrers: [], geo: [], devices: [] } });
    const result = await getLinkStats("new");
    expect(result.totalClicks).toBe(0);
  });
});

// ── createLanding ──

describe("createLanding", () => {
  it("creates a landing page with links", async () => {
    const lp = {
      id: "lp1", slug: "my-links", title: "My Links",
      links: [{ url: "https://github.com", label: "GitHub" }],
      theme: "light", createdAt: "2026-06-12T00:00:00Z",
    };
    globalThis.fetch = mockFetch(201, { data: lp });
    const result = await createLanding({
      title: "My Links",
      links: [{ url: "https://github.com", label: "GitHub" }],
      theme: "light",
    });
    expect(result.slug).toBe("my-links");
    expect(result.links).toHaveLength(1);
  });

  it("creates landing without theme (defaults)", async () => {
    globalThis.fetch = mockFetch(201, { data: { id: "lp2", slug: "simple", title: "Simple", links: [], theme: "minimal", createdAt: "" } });
    const result = await createLanding({ title: "Simple", links: [] });
    expect(result.title).toBe("Simple");
  });
});

// ── whoami ──

describe("whoami", () => {
  it("returns user info", async () => {
    const user = {
      user_id: 1, username: "Test User", email: "test@example.com",
      plan: "pro", planName: "Pro", role: "user",
      subscription: null,
      usage: { links: { used: 5, limit: 100 }, aiSlugs: { used: 0, limit: 1000 }, landingPages: { used: 1, limit: 5 } },
    };
    globalThis.fetch = mockFetch(200, user);
    const result = await whoami();
    expect(result.user_id).toBe(1);
    expect(result.email).toBe("test@example.com");
    expect(result.plan).toBe("pro");
  });

  it("throws on 401", async () => {
    globalThis.fetch = mockFetch(401, "Unauthorized");
    await expect(whoami()).rejects.toThrow(EnkeError);
  });
});
