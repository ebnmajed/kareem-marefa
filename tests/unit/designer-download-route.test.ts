// GET /api/designer/downloads/{artifactId} — the handler's contract (REQ-DSG-027,
// REQ-ADM-021, DEC-177, DEC-178).
//
// WHO may download is `record_export_download()`'s — the lead's, `0152`, with its
// own red→green — and a unit test mocking the DAL cannot prove it. What IS the
// handler's: a malformed id never reaches the DAL; a refusal and a failure
// answer the SAME way, back to the page with `?download=failed`, never a raw
// body; that «back» can never leave this origin; and a download is a `303` to
// the one signer's URL with nothing cached.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const recordExportDownload = vi.fn();
vi.mock("@/lib/dal/posters", () => ({ recordExportDownload: (...a: unknown[]) => recordExportDownload(...a) }));

const { GET } = await import("@/app/api/designer/downloads/[artifactId]/route");

const ORIGIN = "https://kareem.pp.sa";
const ID = "5f0c1d7e-2b8e-4b7a-9d3a-0e6f1c2a4b5c";

const get = (id: string, referer?: string) =>
  GET(new Request(`${ORIGIN}/api/designer/downloads/${id}`, { headers: referer ? { referer } : {} }), { params: Promise.resolve({ artifactId: id }) });

describe("the audited download route", () => {
  beforeEach(() => recordExportDownload.mockReset());

  it("★ a download is a 303 to the signer's URL, uncached", async () => {
    recordExportDownload.mockResolvedValueOnce({ status: "ok", url: "https://storage.example/signed?token=t" });
    const res = await get(ID, `${ORIGIN}/ar/app/sessions/s1`);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://storage.example/signed?token=t");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(recordExportDownload).toHaveBeenCalledWith("ar", ID);
  });

  it("★ a refusal and a failure answer ONE way — back to the page, ?download=failed", async () => {
    for (const status of ["refused", "failed"] as const) {
      recordExportDownload.mockResolvedValueOnce({ status });
      const res = await get(ID, `${ORIGIN}/ar/app/me/certificates?tab=1`);
      expect(res.status).toBe(303);
      const location = new URL(res.headers.get("location") as string);
      expect(location.pathname).toBe("/ar/app/me/certificates");
      expect(location.searchParams.get("download")).toBe("failed");
      expect(location.searchParams.get("tab")).toBe("1");
      expect(await res.text()).toBe("");
    }
  });

  it("a malformed id never reaches the DAL", async () => {
    const res = await get("not-a-uuid", `${ORIGIN}/ar/app/sessions/s1`);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location") as string).searchParams.get("download")).toBe("failed");
    expect(recordExportDownload).not.toHaveBeenCalled();
  });

  it("★ «back» never leaves this origin — another origin's Referer falls back to the app", async () => {
    recordExportDownload.mockResolvedValueOnce({ status: "refused" });
    const res = await get(ID, "https://evil.example/ar/phish");
    const location = new URL(res.headers.get("location") as string);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/ar/app");
  });

  it("no Referer at all falls back to the app too, and the locale follows the Referer when there is one", async () => {
    recordExportDownload.mockResolvedValueOnce({ status: "failed" });
    const res = await get(ID);
    expect(new URL(res.headers.get("location") as string).pathname).toBe("/ar/app");

    recordExportDownload.mockResolvedValueOnce({ status: "ok", url: "https://storage.example/x" });
    await get(ID, `${ORIGIN}/en/app/admin/sessions/s1/certificates`);
    expect(recordExportDownload).toHaveBeenLastCalledWith("en", ID);
  });
});
