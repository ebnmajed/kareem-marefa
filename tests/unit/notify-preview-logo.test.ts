// ★ THE PREVIEW RESOLVES THE ORG'S LOGO — the defect this file exists for.
//
// `send_notification.ts` resolved a logo from `org_public_logo()` and the
// preview never asked at all, so every design previewed with the org's NAME
// where the sent mail carried the logo band. An admin approved a message they
// would never receive.
//
// It is the «empty cell reads like the finding» trap by its other door: the
// forced-dark capture's first cell showed zero `<img>` and looked like a
// palette result, when nothing had ever been fetched. So the case is written
// at the level the bug lived — `compileEmailPreview()`, with the session
// client mocked — and not at the handler, which mocks this function away.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { platformDesign } from "@kareem/mail-runtime";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: async () => ({ timeZone: "Asia/Riyadh" }) }));

const ORG = "11111111-1111-4111-8111-111111111111";
const rpc = vi.fn();
const sessionClient = vi.fn();
vi.mock("@/lib/dal/session", () => ({ sessionClient: (...a: unknown[]) => sessionClient(...a) }));

const { compileEmailPreview } = await import("@/lib/dal/notifications");

/** A brand kit with the three colours `render.ts` reads, so the design
 *  compiles as it does for a real org. */
const KIT = { light: { fgBody: "#2b3a55", fgMuted: "#6f7d93", fgHeading: "#0b1220", surface: "#ffffff", edge: "#e6eaf0", accent: "#0b1220" } };

function client(logoRows: unknown) {
  rpc.mockImplementation((fn: string) => {
    if (fn === "brand_kit") return Promise.resolve({ data: KIT });
    if (fn === "org_public_logo") return Promise.resolve({ data: logoRows });
    return Promise.resolve({ data: null });
  });
  return {
    session: { orgId: ORG, role: "admin", memberId: "m1" },
    supabase: {
      rpc: (...a: unknown[]) => rpc(...a),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "كريم معرفة" } }) }) }) }),
    },
  };
}

const preview = (logoRows: unknown) => {
  sessionClient.mockResolvedValue(client(logoRows));
  return compileEmailPreview("ar", {
    key: "MSG-reminder_1d",
    subject: "غدًا: {{title}}",
    body: "نص",
    blocks: JSON.stringify(platformDesign("MSG-reminder_1d")),
    appUrl: "https://kareem.pp.sa",
  });
};

beforeEach(() => {
  rpc.mockReset();
  sessionClient.mockReset();
});

describe("★ a PNG logo reaches the framed preview", () => {
  it("one `<img>`, and its src is the logo route for THIS org", async () => {
    const out = await preview([{ storage_path: "orgs/x/logo.png" }]);
    expect(out).not.toBeNull();
    const imgs = out!.html.match(/<img\b/g) ?? [];
    expect(imgs).toHaveLength(1);
    expect(out!.html).toContain(`https://kareem.pp.sa/api/brand/${ORG}/logo`);
  });

  it("the preview ASKS — `org_public_logo` is called with this org, which is what was missing", async () => {
    await preview([{ storage_path: "orgs/x/logo.png" }]);
    expect(rpc).toHaveBeenCalledWith("org_public_logo", { p_org: ORG });
  });
});

describe("★ no logo renders the org's NAME, never a broken image", () => {
  it("an org with no public logo row produces no `<img>` at all", async () => {
    // `org_public_logo()` returns nothing for a suspended org, an org with no
    // logo, and an org whose logo is WebP — Outlook's Word engine draws no
    // WebP, so that last one is deliberate rather than an oversight.
    const out = await preview([]);
    expect(out!.html).not.toContain("<img");
    expect(out!.html).toContain("كريم معرفة");
  });

  it("a null answer is treated as no logo rather than crashing the frame", async () => {
    const out = await preview(null);
    expect(out!.html).not.toContain("<img");
  });
});

describe("the preview is wrong exactly when the mail would be", () => {
  it("★ with no origin there is no logo — the same rule the worker applies without `APP_URL`", async () => {
    sessionClient.mockResolvedValue(client([{ storage_path: "orgs/x/logo.png" }]));
    const out = await compileEmailPreview("ar", {
      key: "MSG-reminder_1d",
      subject: "غدًا: {{title}}",
      body: "نص",
      blocks: JSON.stringify(platformDesign("MSG-reminder_1d")),
      appUrl: "",
    });
    // A relative image src in a mail is a broken image, so half an origin is
    // worse than none — and the preview must show that, not hide it.
    expect(out!.html).not.toContain("<img");
  });

  it("a non-admin gets nothing, logo or no logo", async () => {
    sessionClient.mockResolvedValue({ ...client([]), session: { orgId: ORG, role: "moderator", memberId: "m1" } });
    const out = await compileEmailPreview("ar", { key: "MSG-reminder_1d", subject: "s", body: "b", appUrl: "https://kareem.pp.sa" });
    expect(out).toBeNull();
  });
});
