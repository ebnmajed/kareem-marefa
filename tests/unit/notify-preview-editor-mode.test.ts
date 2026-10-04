// POST /api/admin/emails/preview in the builder's canvas mode — wave 23, REQ-UIX-112, REQ-NTF-010.
// The canvas lays its selection over the renderer's frame, so it must be able to read where each row landed: the flag
// must reach the renderer (data-k on every row), and the frame's own policy must keep the parent's origin
// (`sandbox allow-same-origin`, still no scripts). Without either, the canvas draws no targets at all.
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

describe("the canvas's mode", () => {
  beforeEach(() => {
    compileEmailPreview.mockReset();
    compileEmailPreview.mockResolvedValue({ html: '<html><tr data-k="h1"></tr></html>', text: "", subject: "" });
  });

  it("carries the flag and the tokens to the renderer", async () => {
    await post({ key: "MSG-reminder_1d", mode: "html", editor: "1", tokens: JSON.stringify({ "member.name": "اسم العضو" }) });
    expect(compileEmailPreview).toHaveBeenCalledWith("ar", expect.objectContaining({ editor: true, tokens: { "member.name": "اسم العضو" } }));
  });

  it("★ answers with a policy that keeps the parent's origin — and still no scripts", async () => {
    const response = await post({ key: "MSG-reminder_1d", mode: "html", editor: "1" });
    const csp = response.headers.get("content-security-policy")!;
    expect(csp).toMatch(/(^|; )sandbox allow-same-origin$/);
    expect(csp).not.toContain("allow-scripts");
  });

  it("the ordinary preview stays fully sandboxed", async () => {
    const response = await post({ key: "MSG-reminder_1d", mode: "html" });
    expect(response.headers.get("content-security-policy")).toMatch(/(^|; )sandbox$/);
    expect(compileEmailPreview).toHaveBeenCalledWith("ar", expect.objectContaining({ editor: false }));
  });
});
