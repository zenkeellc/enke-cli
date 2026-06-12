import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock auth and mime before importing
vi.mock("../auth.js", () => ({
  getToken: vi.fn(() => Promise.resolve("test-token")),
  API_URL: "https://api.en.ke",
}));

import {
  uploadDoc, listDocs, getDoc, deleteDoc, updateDoc,
  renewDoc, editDocExpiration, EnkeError,
} from "../client.js";

const { getToken } = await import("../auth.js");

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

let testDir: string;
let testFile: string;

beforeEach(() => {
  vi.restoreAllMocks();
  testDir = path.join(os.tmpdir(), `enke-doc-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  testFile = path.join(testDir, "test-report.txt");
  fs.writeFileSync(testFile, "Hello, en.ke!\n");
});

// ── uploadDoc ──

describe("uploadDoc", () => {
  it("uploads a file and returns doc details", async () => {
    const doc = {
      uid: "user1", id: "doc1", slug: "abc123",
      filename: "test-report.txt", content_type: "text/plain",
      size: 14, comment: null, ctime: Date.now() / 1000, mtime: Date.now() / 1000,
      exp_days: 30, password: null, max_downloads: 0, download_count: 0,
      disable_download: false, burn_after_reading: false,
      watermark: null, view_count: 0,
    };
    globalThis.fetch = mockFetch(201, { success: true, result: { doc } });

    const result = await uploadDoc(testFile, "test-report.txt", { exp_days: 30 });
    expect(result.slug).toBe("abc123");
    expect(result.filename).toBe("test-report.txt");
    expect(result.content_type).toBe("text/plain");
  });

  it("passes metadata options to the API", async () => {
    globalThis.fetch = mockFetch(201, { success: true, result: { doc: { slug: "x", filename: "f", content_type: "text/plain", size: 0, exp_days: 7, view_count: 0, download_count: 0, ctime: 0, mtime: 0, disable_download: false, burn_after_reading: false, max_downloads: 0, uid: "u", id: "i", password: null, comment: null, watermark: null } } });

    await uploadDoc(testFile, "f.txt", {
      exp_days: 7,
      password: "secret",
      comment: "My note",
      burn_after_reading: true,
      disable_download: true,
      max_downloads: 5,
    });

    // Verify fetch was called with multipart data containing metadata JSON
    const callArgs = (globalThis.fetch as ReturnType<typeof mockFetch>).mock.calls[0] as [string, RequestInit];
    const bodyText = Buffer.from((callArgs[1].body as Buffer).buffer).toString();
    expect(bodyText).toContain('"exp_days":7');
    expect(bodyText).toContain('"password":"secret"');
    expect(bodyText).toContain('"comment":"My note"');
    expect(bodyText).toContain('"burn_after_reading":true');
    expect(bodyText).toContain('"disable_download":true');
    expect(bodyText).toContain('"max_downloads":5');
  });

  it("throws when not authenticated", async () => {
    vi.mocked(getToken).mockResolvedValueOnce(null);
    globalThis.fetch = mockFetch(200, {});
    await expect(uploadDoc(testFile, "f.txt")).rejects.toThrow(EnkeError);
  });

  it("throws on API error", async () => {
    globalThis.fetch = mockFetch(413, "File too large");
    await expect(uploadDoc(testFile, "f.txt")).rejects.toThrow(EnkeError);
  });
});

// ── listDocs ──

describe("listDocs", () => {
  it("lists documents", async () => {
    const response = {
      list_complete: true,
      cursor: "",
      docs: [
        { uid: "u1", id: "d1", slug: "abc", filename: "a.txt", content_type: "text/plain", size: 100, comment: null, ctime: 1, mtime: 1, exp_days: 30, password: null, max_downloads: 0, download_count: 0, disable_download: false, burn_after_reading: false, watermark: null, view_count: 5 },
      ],
    };
    globalThis.fetch = mockFetch(200, response);
    const result = await listDocs();
    expect(result.docs).toHaveLength(1);
    expect(result.list_complete).toBe(true);
  });

  it("passes cursor and limit", async () => {
    globalThis.fetch = mockFetch(200, { list_complete: true, cursor: "", docs: [] });
    await listDocs("next-page", 10);
    const url = (globalThis.fetch as ReturnType<typeof mockFetch>).mock.calls[0][0] as string;
    expect(url).toContain("cursor=next-page");
    expect(url).toContain("limit=10");
  });
});

// ── getDoc ──

describe("getDoc", () => {
  it("gets a single document", async () => {
    const doc = { slug: "abc", filename: "f.txt", content_type: "text/plain", size: 100, view_count: 3, download_count: 0, exp_days: 30, ctime: 0, mtime: 0, uid: "u", id: "d", password: null, comment: null, max_downloads: 0, disable_download: false, burn_after_reading: false, watermark: null };
    globalThis.fetch = mockFetch(200, doc);
    const result = await getDoc("abc");
    expect(result.slug).toBe("abc");
    expect(result.view_count).toBe(3);
  });

  it("throws on not found", async () => {
    globalThis.fetch = mockFetch(404, "Not found");
    await expect(getDoc("nonexistent")).rejects.toThrow(EnkeError);
  });
});

// ── deleteDoc ──

describe("deleteDoc", () => {
  it("deletes successfully", async () => {
    globalThis.fetch = mockFetch(200, { success: true });
    await expect(deleteDoc("abc")).resolves.toBeUndefined();
  });

  it("throws on error", async () => {
    globalThis.fetch = mockFetch(404, "Not found");
    await expect(deleteDoc("gone")).rejects.toThrow(EnkeError);
  });
});

// ── updateDoc ──

describe("updateDoc", () => {
  it("updates document settings", async () => {
    const updated = { slug: "abc", filename: "f.txt", content_type: "text/plain", size: 100, view_count: 0, download_count: 0, exp_days: 14, ctime: 0, mtime: 0, uid: "u", id: "d", password: null, comment: null, max_downloads: 0, disable_download: false, burn_after_reading: false, watermark: null };
    globalThis.fetch = mockFetch(200, { success: true, result: { doc: updated } });
    const result = await updateDoc("abc", { exp_days: 14, password: "newpw" });
    expect(result.exp_days).toBe(14);
  });
});

// ── renewDoc ──

describe("renewDoc", () => {
  it("renews document expiration", async () => {
    const renewed = { slug: "abc", exp_days: 30, filename: "f", content_type: "text/plain", size: 0, view_count: 0, download_count: 0, ctime: 0, mtime: 0, uid: "u", id: "d", password: null, comment: null, max_downloads: 0, disable_download: false, burn_after_reading: false, watermark: null };
    globalThis.fetch = mockFetch(200, { success: true, result: { doc: renewed } });
    const result = await renewDoc("abc");
    expect(result.exp_days).toBe(30);
    expect(result.slug).toBe("abc");
  });
});

// ── editDocExpiration ──

describe("editDocExpiration", () => {
  it("sets custom expiration days", async () => {
    const exp = { slug: "abc", exp_days: 60, filename: "f", content_type: "text/plain", size: 0, view_count: 0, download_count: 0, ctime: 0, mtime: 0, uid: "u", id: "d", password: null, comment: null, max_downloads: 0, disable_download: false, burn_after_reading: false, watermark: null };
    globalThis.fetch = mockFetch(200, { success: true, result: { doc: exp } });
    const result = await editDocExpiration("abc", 60);
    expect(result.exp_days).toBe(60);
  });
});
