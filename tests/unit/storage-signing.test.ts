// worker/src/content/storage.ts — the worker's Storage URL signing (07 §4.2,
// DEC-032: the converter itself holds no credentials, so the worker mints two
// short-lived signed URLs and hands them over). Raw fetch, mocked here —
// no real Storage call.
import { afterEach, describe, expect, it, vi } from "vitest";
import { signReadUrl, signUploadUrl } from "../../worker/src/content/storage";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

function stubFetch(response: { ok: boolean; status?: number; json?: () => Promise<unknown>; text?: () => Promise<string> }) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: response.ok, status: response.status ?? (response.ok ? 200 : 500), json: response.json, text: response.text });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("signReadUrl / signUploadUrl", () => {
  it("throws when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing, before any network call", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = stubFetch({ ok: true, json: async () => ({}) });
    await expect(signReadUrl("materials", "x/y.pdf")).rejects.toThrow(/SUPABASE_URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signReadUrl posts to /storage/v1/object/sign/{bucket}/{path} and prefixes the returned path with the storage API root", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sk-test";
    const fetchMock = stubFetch({ ok: true, json: async () => ({ signedURL: "/object/sign/materials/x/y.pdf?token=abc" }) });

    const url = await signReadUrl("materials", "x/y.pdf", 120);

    expect(url).toBe("https://example.supabase.co/storage/v1/object/sign/materials/x/y.pdf?token=abc");
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://example.supabase.co/storage/v1/object/sign/materials/x/y.pdf");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer sk-test");
    expect(JSON.parse(init.body)).toEqual({ expiresIn: 120 });
  });

  it("signUploadUrl posts to /storage/v1/object/upload/sign/{bucket}/{path} with no body", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sk-test";
    const fetchMock = stubFetch({ ok: true, json: async () => ({ url: "/object/upload/sign/material-pages/p/1.webp?token=xyz" }) });

    const url = await signUploadUrl("material-pages", "p/1.webp");

    expect(url).toBe("https://example.supabase.co/storage/v1/object/upload/sign/material-pages/p/1.webp?token=xyz");
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://example.supabase.co/storage/v1/object/upload/sign/material-pages/p/1.webp");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("throws, naming the status, when Storage refuses the sign request", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sk-test";
    stubFetch({ ok: false, status: 404, text: async () => "not found" });
    await expect(signReadUrl("materials", "missing.pdf")).rejects.toThrow(/404/);
  });

  it("throws when Storage returns 200 with no signedURL/url field", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sk-test";
    stubFetch({ ok: true, json: async () => ({}) });
    await expect(signReadUrl("materials", "x.pdf")).rejects.toThrow(/no signedURL/);
  });
});
