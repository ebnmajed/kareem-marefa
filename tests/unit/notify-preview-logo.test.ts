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

/** Sessions the preview may offer as a card, newest first, and what
 *  `session_public_card()` answers for each. */
interface Candidates {
  ids?: string[];
  cards?: Record<string, { og_path: string | null }>;
}

function client(logoRows: unknown, candidates: Candidates = {}) {
  rpc.mockImplementation((fn: string, args?: Record<string, string>) => {
    if (fn === "brand_kit") return Promise.resolve({ data: KIT });
    if (fn === "org_public_logo") return Promise.resolve({ data: logoRows });
    if (fn === "session_public_card") {
      const card = candidates.cards?.[args?.p_session ?? ""];
      return Promise.resolve({ data: card ? [card] : [] });
    }
    return Promise.resolve({ data: null });
  });
  const sessions = {
    select: () => ({
      eq: () => ({ order: () => ({ limit: async () => ({ data: (candidates.ids ?? []).map((id) => ({ id })) }) }) }),
    }),
  };
  return {
    session: { orgId: ORG, role: "admin", memberId: "m1" },
    supabase: {
      rpc: (...a: unknown[]) => rpc(...a),
      from: (table: string) =>
        table === "sessions"
          ? sessions
          : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "كريم معرفة" } }) }) }) },
    },
  };
}

const preview = (logoRows: unknown, candidates: Candidates = {}) => {
  sessionClient.mockResolvedValue(client(logoRows, candidates));
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

describe("★ the session card's image — the logo's twin, and the same «never asked»", () => {
  // Three of the eight designs carry a card image. The worker supplies it as
  // `payload.session_card_image_url`; the preview supplied nothing, so those
  // three previewed a card with no picture.
  const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("a real session whose poster HAS rendered supplies the card image", async () => {
    const out = await preview([], { ids: [SESSION], cards: { [SESSION]: { og_path: "orgs/x/og.png" } } });
    expect(out!.html).toContain(`https://kareem.pp.sa/api/s/${SESSION}/og`);
  });

  it("★ it ASKS `session_public_card()` rather than re-deriving the rule (contract F3)", async () => {
    await preview([], { ids: [SESSION], cards: { [SESSION]: { og_path: "orgs/x/og.png" } } });
    expect(rpc).toHaveBeenCalledWith("session_public_card", { p_session: SESSION });
  });

  it("★ a session whose poster has NOT rendered is skipped, not shown as a broken image", async () => {
    // `og_path` null is «the poster has not finished rendering» — which a
    // state check on the session would call ready. This is why the rule is
    // asked for rather than copied.
    const next = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const out = await preview([], {
      ids: [SESSION, next],
      cards: { [SESSION]: { og_path: null }, [next]: { og_path: "orgs/x/og.png" } },
    });
    expect(out!.html).toContain(`/api/s/${next}/og`);
    expect(out!.html).not.toContain(`/api/s/${SESSION}/og`);
  });

  it("an org with no card-bearing session renders one row fewer, never a broken image", async () => {
    const out = await preview([], { ids: [SESSION], cards: { [SESSION]: { og_path: null } } });
    expect(out!.html).not.toContain("/api/s/");
    expect(out!.html).not.toContain("<img");
  });

  it("★ the SAMPLE's fake session id is never used — it names no row and would 404 in the frame", async () => {
    const out = await preview([], {});
    expect(out!.html).not.toContain("/api/s/");
  });
});

describe("it asks only for what the document will render", () => {
  it("★ a design with NO card block never queries for one — work with no reader", async () => {
    // Five of the eight designs carry no card. `MSG-badge_earned` is one.
    sessionClient.mockResolvedValue(client([], { ids: ["x"], cards: { x: { og_path: "orgs/x/og.png" } } }));
    await compileEmailPreview("ar", {
      key: "MSG-badge_earned",
      subject: "شارة جديدة",
      body: "نص",
      blocks: JSON.stringify(platformDesign("MSG-badge_earned")),
      appUrl: "https://kareem.pp.sa",
    });
    expect(rpc).not.toHaveBeenCalledWith("session_public_card", expect.anything());
  });

  it("the STRING path asks for no card either — it has no block to render one", async () => {
    sessionClient.mockResolvedValue(client([], { ids: ["x"], cards: { x: { og_path: "orgs/x/og.png" } } }));
    await compileEmailPreview("ar", { key: "MSG-reminder_1d", subject: "s", body: "b", appUrl: "https://kareem.pp.sa" });
    expect(rpc).not.toHaveBeenCalledWith("session_public_card", expect.anything());
  });
});
