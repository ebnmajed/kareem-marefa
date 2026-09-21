// POST /api/admin/emails/preview — the handler's contract (REQ-NTF-010,
// DEC-161 D2).
//
// What is worth testing here is not the rendering — `mail-blocks` and
// `mail-pinned` own that — but the four things the HANDLER decides: who is
// refused and how indistinguishably, what headers the framed document carries,
// that the text mode is served as text, and that a malformed request says
// nothing useful.
//
// ★ THE ROLE ITSELF IS AN E2E CASE, NOT THIS ONE. `canEditEmailTemplates()`
// reads the session's role through the DAL, so a unit test mocking the DAL can
// only assert what the handler does with the ANSWER. That a **moderator** gets
// that answer — the role most likely to probe, since `/app/admin/emails` is
// admin-only and the rail shows moderators more entries than it did — is
// asserted against real Supabase in `tests/e2e/wave10-notify-studio.spec.ts`,
// beside the member.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const compileEmailPreview = vi.fn();
vi.mock("@/lib/dal/notifications", () => ({ compileEmailPreview: (...a: unknown[]) => compileEmailPreview(...a) }));

const { POST } = await import("@/app/api/admin/emails/preview/route");

const post = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return POST(new Request("https://kareem.pp.sa/api/admin/emails/preview", { method: "POST", body: form }));
};

const RENDERED = { html: "<!doctype html><html dir=\"rtl\"></html>", text: "نص الرسالة", subject: "الموضوع" };

describe("who is refused, and how indistinguishably", () => {
  beforeEach(() => compileEmailPreview.mockReset());

  it("★ every refusal is ONE shape — the handler never branches on why", async () => {
    // ★ WHAT THIS PROVES, AND WHAT IT DOES NOT. `compileEmailPreview()`
    // collapses both causes to `null` — a caller who may not edit templates,
    // and a key `08` §1 does not list — and THAT collapsing is the DAL's, so a
    // test mocking the DAL cannot prove it. What is proven here is the half
    // that lives in the handler: given `null`, it emits one response, with no
    // branch on the reason. A preview that 404s differently for «not you» and
    // «no such message» would be an enumeration oracle for the product's whole
    // message catalogue.
    compileEmailPreview.mockResolvedValue(null);
    const refused = await post({ key: "MSG-reminder_1d", mode: "html" });
    const unknown = await post({ key: "MSG-not-a-message", mode: "html" });

    expect(refused.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await refused.text()).toBe(await unknown.text());
    expect(refused.headers.get("content-type")).toBe(unknown.headers.get("content-type"));
  });

  it("a malformed request is 400 and says nothing about what was wrong with it", async () => {
    compileEmailPreview.mockResolvedValue(RENDERED);
    const bad = await post({ key: "no", mode: "html" });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toBe("bad_request");
    // Zod ran before the DAL: an invalid request never reaches the renderer.
    expect(compileEmailPreview).not.toHaveBeenCalled();
  });
});

describe("the headers the framed document carries", () => {
  beforeEach(() => {
    compileEmailPreview.mockReset();
    compileEmailPreview.mockResolvedValue(RENDERED);
  });

  it("★ its own policy, including `sandbox` — so the document is sandboxed even opened top-level", async () => {
    const res = await post({ key: "MSG-reminder_1d", mode: "html" });
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    // Inline CSS is what a mail IS (`08` §3.1), so the one thing this policy
    // must permit is the one thing the app's policy forbids.
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).toContain("sandbox");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it("SAMEORIGIN, not DENY — our own editor frames it and nobody else may", async () => {
    const res = await post({ key: "MSG-reminder_1d", mode: "html" });
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("the modes", () => {
  beforeEach(() => {
    compileEmailPreview.mockReset();
    compileEmailPreview.mockResolvedValue(RENDERED);
  });

  it("html is served as html, and the plain-text mode as TEXT — what a stripped client actually shows", async () => {
    const html = await post({ key: "MSG-reminder_1d", mode: "html" });
    expect(html.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await html.text()).toBe(RENDERED.html);

    const text = await post({ key: "MSG-reminder_1d", mode: "text" });
    expect(text.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await text.text()).toBe(RENDERED.text);
  });

  it("★ the preview's links use the origin the REQUEST arrived on — never localhost in production, never a relative link", async () => {
    await post({ key: "MSG-reminder_1d", mode: "html" });
    expect(compileEmailPreview).toHaveBeenCalledWith("ar", expect.objectContaining({ appUrl: "https://kareem.pp.sa" }));
  });

  it("the unsaved draft travels with the request — the preview reads nothing of it from the database", async () => {
    const blocks = JSON.stringify({ schemaVersion: 1, blocks: [{ type: "heading", id: "h1", text: "عنوان", level: 1 }] });
    await post({ key: "MSG-reminder_1d", mode: "html", subject: "موضوع", body: "نص", blocks });
    expect(compileEmailPreview).toHaveBeenCalledWith("ar", expect.objectContaining({ subject: "موضوع", body: "نص", blocks }));
  });
});
