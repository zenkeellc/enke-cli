import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../auth.js", () => ({
  getToken: vi.fn(() => Promise.resolve("test-token")),
  API_URL: "https://api.en.ke",
}));

import { listDevices, startDevicePair, deleteDevice, EnkeError } from "../client.js";

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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("listDevices", () => {
  it("calls GET /api/v1/devices and returns the device list", async () => {
    const devices = [
      {
        id: "dev_abc",
        name: "Desk e-ink",
        platform: "esp32",
        capabilities: { screen: "eink" },
        created_at: 1700000000000,
        last_seen_at: null,
      },
    ];
    const fetchMock = mockFetch(200, { success: true, result: { devices } });
    globalThis.fetch = fetchMock;

    const result = await listDevices();
    expect(result).toEqual(devices);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.en.ke/api/v1/devices");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("returns an empty array when result.devices is missing", async () => {
    globalThis.fetch = mockFetch(200, { success: true, result: {} });
    await expect(listDevices()).resolves.toEqual([]);
  });

  it("throws EnkeError on 401", async () => {
    globalThis.fetch = mockFetch(401, { error: "UNAUTHORIZED", message: "Not authenticated" });
    await expect(listDevices()).rejects.toThrow(EnkeError);
  });

  it("throws when not logged in", async () => {
    vi.mocked(getToken).mockResolvedValueOnce(null);
    globalThis.fetch = mockFetch(200, { success: true, result: { devices: [] } });
    await expect(listDevices()).rejects.toThrow(EnkeError);
  });
});

describe("startDevicePair", () => {
  it("calls POST /api/v1/devices/pair/start with name and platform", async () => {
    const pairing = { code: "ABC12345", expires_at: 1700000300000 };
    const fetchMock = mockFetch(200, { success: true, result: pairing });
    globalThis.fetch = fetchMock;

    const result = await startDevicePair({ name: "Desk e-ink", platform: "esp32" });
    expect(result).toEqual(pairing);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.en.ke/api/v1/devices/pair/start");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Desk e-ink", platform: "esp32" });
  });

  it("omits empty options", async () => {
    const fetchMock = mockFetch(200, { success: true, result: { code: "ZZZ99999", expires_at: 1 } });
    globalThis.fetch = fetchMock;

    await startDevicePair();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("surfaces server error codes", async () => {
    globalThis.fetch = mockFetch(410, { error: "PAIR_CODE_EXPIRED", message: "Pair code expired" });
    try {
      await startDevicePair();
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as EnkeError).errorCode).toBe("PAIR_CODE_EXPIRED");
      expect((err as EnkeError).statusCode).toBe(410);
    }
  });
});

describe("deleteDevice", () => {
  it("calls DELETE /api/v1/devices/:id", async () => {
    const fetchMock = mockFetch(200, { success: true, result: { deleted: "dev_abc" } });
    globalThis.fetch = fetchMock;

    await deleteDevice("dev_abc");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.en.ke/api/v1/devices/dev_abc");
    expect(init.method).toBe("DELETE");
  });
});
