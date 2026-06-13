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
    const apiLink = {
      uid: "1", id: "abc123", slug: "my-link", url: "https://example.com",
      ctime: 1700000000, mtime: 1700000000, exp_days: 30,
    };
    globalThis.fetch = mockFetch(200, { success: true, link: apiLink });

    const result = await shorten("https://example.com");
    expect(result.slug).toBe("my-link");
    expect(result.shortUrl).toBe("https://en.ke/my-link");
    expect(result.url).toBe("https://example.com");
  });

  it("passes options to the API", async () => {
    const apiLink = {
      uid: "1", id: "x", slug: "custom", url: "https://x.com",
      ctime: 1700000000, mtime: 1700000000, exp_days: 7, password: "hash",
    };
    globalThis.fetch = mockFetch(200, { success: true, link: apiLink });
    await shorten("https://x.com", { slug: "custom", password: "pw", keep_days: 7 });

    const callArgs = (globalThis.fetch as ReturnType<typeof mockFetch>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.slug).toBe("custom");
    expect(body.password).toBe("pw");
    expect(body.keep_days).toBe(7);
    // webhookUrl should not be sent (removed from API)
    expect(body.webhookUrl).toBeUndefined();
  });

  it("throws EnkeError on API failure", async () => {
    globalThis.fetch = mockFetch(400, "Bad URL");
    await expect(shorten("not-a-url")).rejects.toThrow(EnkeError);
  });

  it("throws when not authenticated", async () => {
    vi.mocked(getToken).mockResolvedValueOnce(null);
    globalThis.fetch = mockFetch(200, { success: true, link: {} });
    await expect(shorten("https://x.com")).rejects.toThrow(EnkeError);
  });
});

// ── listLinks ──

describe("listLinks", () => {
  it("lists links with defaults", async () => {
    const apiLinks = [
      { uid: "1", id: "1", slug: "a", url: "https://a.com", ctime: 1700000000, mtime: 1700000000, exp_days: 30 },
      { uid: "1", id: "2", slug: "b", url: "https://b.com", ctime: 1700000000, mtime: 1700000000, exp_days: 30, password: "hash" },
    ];
    globalThis.fetch = mockFetch(200, { list_complete: true, cursor: null, links: apiLinks });
    const result = await listLinks({ uid: "1" });
    expect(result.links).toHaveLength(2);
    expect(result.links[0].slug).toBe("a");
    expect(result.list_complete).toBe(true);
  });

  it("passes uid and cursor params", async () => {
    globalThis.fetch = mockFetch(200, { list_complete: true, cursor: null, links: [] });
    await listLinks({ uid: "3", cursor: "abc123" });
    const url = (globalThis.fetch as ReturnType<typeof mockFetch>).mock.calls[0][0] as string;
    expect(url).toContain("uid=3");
    expect(url).toContain("cursor=abc123");
  });

  it("returns empty list when no links", async () => {
    globalThis.fetch = mockFetch(200, { list_complete: true, cursor: null, links: [] });
    const result = await listLinks({ uid: "1" });
    expect(result.links).toEqual([]);
  });
});

// ── getLink ──

describe("getLink", () => {
  it("fetches a single link by slug", async () => {
    const apiLink = { uid: "1", id: "1", slug: "abc", url: "https://x.com", ctime: 1700000000, mtime: 1700000000, exp_days: 30 };
    globalThis.fetch = mockFetch(200, apiLink);
    const result = await getLink("abc");
    expect(result.slug).toBe("abc");
    expect(result.shortUrl).toBe("https://en.ke/abc");
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
  it("updates a link's URL", async () => {
    const updated = { uid: "1", id: "1", slug: "abc", url: "https://new-url.com", ctime: 1700000000, mtime: 1700000100, exp_days: 30 };
    globalThis.fetch = mockFetch(200, { success: true, result: { link: updated } });
    const result = await updateLink("abc", { url: "https://new-url.com" });
    expect(result.slug).toBe("abc");
    expect(result.url).toBe("https://new-url.com");
  });

  it("updates password", async () => {
    const updated = { uid: "1", id: "1", slug: "x", url: "https://x.com", ctime: 1700000000, mtime: 1700000100, exp_days: 30, password: "hash" };
    globalThis.fetch = mockFetch(200, { success: true, result: { link: updated } });
    const result = await updateLink("x", { password: "new-pw" });
    expect(result.passwordProtected).toBe(true);
  });

  it("uses PUT method", async () => {
    globalThis.fetch = mockFetch(200, { success: true, result: { link: { uid: "1", id: "1", slug: "x", url: "https://x.com", ctime: 1, mtime: 1, exp_days: 30 } } });
    await updateLink("x", { url: "https://y.com" });
    const callArgs = (globalThis.fetch as ReturnType<typeof mockFetch>).mock.calls[0] as [string, RequestInit];
    expect(callArgs[1].method).toBe("PUT");
  });
});

// ── getLinkStats ──

describe("getLinkStats", () => {
  it("returns click analytics", async () => {
    const stats = {
      overview: { total_visits: 42, unique_countries: 5, unique_referers: 3 },
      time_series: [{ date: "2026-06-12", visits: 10 }],
      top_countries: [{ label: "US", count: 20, percentage: 47.6 }],
      top_referers: [{ label: "twitter.com", count: 5, percentage: 11.9 }],
      devices: [{ label: "Mobile", count: 15, percentage: 35.7 }],
    };
    globalThis.fetch = mockFetch(200, stats);
    const result = await getLinkStats("abc", "1");
    expect(result.overview.total_visits).toBe(42);
    expect(result.time_series).toHaveLength(1);
    expect(result.top_referers).toHaveLength(1);
    expect(result.top_countries).toHaveLength(1);
    expect(result.devices).toHaveLength(1);
  });

  it("uses correct link_stat endpoint", async () => {
    globalThis.fetch = mockFetch(200, { overview: { total_visits: 0, unique_countries: 0, unique_referers: 0 }, time_series: [], top_countries: [], top_referers: [], devices: [] });
    await getLinkStats("abc", "1");
    const url = (globalThis.fetch as ReturnType<typeof mockFetch>).mock.calls[0][0] as string;
    expect(url).toContain("/api/v1/link_stat/abc");
    expect(url).toContain("uid=1");
  });

  it("handles zero-click stats", async () => {
    globalThis.fetch = mockFetch(200, { overview: { total_visits: 0, unique_countries: 0, unique_referers: 0 }, time_series: [], top_countries: [], top_referers: [], devices: [] });
    const result = await getLinkStats("new");
    expect(result.overview.total_visits).toBe(0);
  });
});

// ── createLanding ──

describe("createLanding", () => {
  it("creates a landing page with links", async () => {
    const page = {
      uid: "1", slug: "my-links", title: "My Links",
      links: [{ title: "GitHub", url: "https://github.com", sort_order: 0 }],
      ctime: 1700000000, mtime: 1700000000,
    };
    globalThis.fetch = mockFetch(200, { success: true, result: { page } });
    const result = await createLanding({
      slug: "my-links",
      title: "My Links",
      links: [{ url: "https://github.com", title: "GitHub" }],
    });
    expect(result.slug).toBe("my-links");
    expect(result.links).toHaveLength(1);
    expect(result.links[0].title).toBe("GitHub");
  });

  it("slug is now required", async () => {
    globalThis.fetch = mockFetch(200, { success: true, result: { page: { uid: "1", slug: "simple", title: "Simple", links: [], ctime: 1, mtime: 1 } } });
    const result = await createLanding({ slug: "simple", title: "Simple", links: [] });
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


// ── Structured API error parsing ──

describe("structured error handling", () => {
  it("parses structured error JSON with code, message, params", async () => {
    const errorBody = JSON.stringify({
      error: "LINK_LIMIT_REACHED",
      message: "Link limit (100) reached. Your plan: hobby. Upgrade for more links.",
      params: { limit: 100, current: 100, plan: "hobby" },
    });
    globalThis.fetch = mockFetch(429, errorBody);

    try {
      await shorten("https://example.com");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnkeError);
      const e = err as EnkeError;
      expect(e.statusCode).toBe(429);
      expect(e.errorCode).toBe("LINK_LIMIT_REACHED");
      expect(e.message).toBe("Link limit (100) reached. Your plan: hobby. Upgrade for more links.");
      expect(e.params).toEqual({ limit: 100, current: 100, plan: "hobby" });
    }
  });

  it("parses structured error without params", async () => {
    const errorBody = JSON.stringify({
      error: "AUTH_REQUIRED",
      message: "Unauthorized",
    });
    globalThis.fetch = mockFetch(401, errorBody);

    try {
      await whoami();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnkeError);
      const e = err as EnkeError;
      expect(e.statusCode).toBe(401);
      expect(e.errorCode).toBe("AUTH_REQUIRED");
      expect(e.message).toBe("Unauthorized");
      expect(e.params).toBeUndefined();
    }
  });

  it("falls back to raw text for non-JSON error body", async () => {
    globalThis.fetch = mockFetch(500, "Internal Server Error");

    try {
      await shorten("https://example.com");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnkeError);
      const e = err as EnkeError;
      expect(e.statusCode).toBe(500);
      expect(e.message).toBe("Internal Server Error");
      expect(e.errorCode).toBeUndefined();
    }
  });

  it("handles JSON without error/message fields as raw text", async () => {
    const errorBody = JSON.stringify({ detail: "Something went wrong" });
    globalThis.fetch = mockFetch(400, errorBody);

    try {
      await shorten("https://example.com");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnkeError);
      const e = err as EnkeError;
      expect(e.statusCode).toBe(400);
      expect(e.message).toBe(errorBody);
      expect(e.errorCode).toBeUndefined();
    }
  });

  it("handles empty error body", async () => {
    globalThis.fetch = mockFetch(500, "");
    try {
      await shorten("https://example.com");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnkeError);
      const e = err as EnkeError;
      expect(e.statusCode).toBe(500);
      expect(e.message).toBe("Unknown error");
    }
  });

  it("parses quota exceeded error with params for i18n", async () => {
    const errorBody = JSON.stringify({
      error: "CUSTOM_SLUG_QUOTA_EXCEEDED",
      message: "Monthly custom slug limit (10) reached. Your plan: hobby. Upgrade for more.",
      params: { limit: 10, current: 10, plan: "hobby" },
    });
    globalThis.fetch = mockFetch(429, errorBody);

    try {
      await shorten("https://example.com", { slug: "my-slug" });
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as EnkeError;
      expect(e.errorCode).toBe("CUSTOM_SLUG_QUOTA_EXCEEDED");
      expect(e.params).toEqual({ limit: 10, current: 10, plan: "hobby" });
    }
  });

  it("parses feature-gated error (402)", async () => {
    const errorBody = JSON.stringify({
      error: "FEATURE_REQUIRES_PAID_PLAN",
      message: "Password protection requires Pro plan or higher. Upgrade to unlock.",
      params: { feature: "password", requiredPlan: "pro" },
    });
    globalThis.fetch = mockFetch(402, errorBody);

    try {
      await shorten("https://example.com", { password: "secret" });
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as EnkeError;
      expect(e.statusCode).toBe(402);
      expect(e.errorCode).toBe("FEATURE_REQUIRES_PAID_PLAN");
      expect(e.params?.requiredPlan).toBe("pro");
    }
  });
});
