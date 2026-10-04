// Wave 25 — the mail that announces a member's addition (`REQ-NTF-017`, `DEC-243` §6, `DEC-244` §8).
//
// What makes this mail different from the twenty-five is what these cases hold: it is NOT in the
// matrix, it does not join `DESIGN_FOR`, and it reaches the renderer as a template override — so
// `tests/unit/mail-designs.test.ts`'s pin at exactly 25 keys stays true, and the 120 pinned files
// are untouched by the whole feature.
import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES, DESIGN_FOR, INVITATION_SUBJECT, invitationDesign, platformDesign, readDocument, renderEmail, SAMPLE_ORG } from "@kareem/mail-runtime";

const KEY = "MAIL-member_added";
const render = () =>
  renderEmail({
    key: KEY,
    override: { subject: INVITATION_SUBJECT, body: null, blocks: invitationDesign() },
    payload: { org: SAMPLE_ORG.name, url: "https://example.test" },
    member: { name: "ضيف من خارج المؤسسة", email: "outsider@gmail.com" },
    org: { name: SAMPLE_ORG.name, timeZone: "Asia/Riyadh" },
    brand: null,
    logoUrl: null,
    appUrl: "https://example.test",
  });

describe("★ REQ-NTF-017 — it is transactional, not a matrix message", () => {
  it("is absent from the template table and from DESIGN_FOR, which stay at 25", () => {
    expect(Object.keys(DEFAULT_TEMPLATES)).toHaveLength(25);
    expect(Object.keys(DESIGN_FOR)).toHaveLength(25);
    expect(DEFAULT_TEMPLATES).not.toHaveProperty(KEY);
    expect(DESIGN_FOR).not.toHaveProperty(KEY);
    // So a key lookup could never find it — which is why the worker passes the document itself.
    expect(platformDesign(KEY)).toBeNull();
  });

  it("renders anyway, because the design arrives as the override", () => {
    const mail = render();
    expect(mail.subject).toContain(SAMPLE_ORG.name);
    expect(mail.html).toContain("أنت الآن عضو");
    expect(mail.html).toContain("سجّل الدخول");
  });
});

describe("the mail itself", () => {
  it("wears the announcement family's shape — the heading, the greeting, one button", () => {
    const doc = readDocument(invitationDesign());
    expect(doc).not.toBeNull();
    const types = doc!.blocks.map((b) => b.type);
    // The logo first — every design carries it, and `compileBlocks()` appends the footer — then the
    // heading and the greeting, which is the shape the other eight wear.
    expect(types[0]).toBe("image");
    expect(types[1]).toBe("heading");
    expect(types).toContain("paragraph");
    expect(types.filter((t) => t === "button")).toHaveLength(1);
    // The house style wave 24 gave every design (`DEC-242`) — read off the document itself, and
    // compared with one of the eight so the two cannot drift apart.
    expect(invitationDesign().styles).toEqual(platformDesign("MSG-session_published")!.styles);
  });

  it("carries a generated text alternative, and no SVG anywhere (invariant 11)", () => {
    const mail = render();
    expect(mail.text.length).toBeGreaterThan(0);
    expect(mail.text).toContain("أنت الآن عضو");
    expect(mail.html).not.toMatch(/<svg|image\/svg/i);
  });

  it("names the org and links to the app — a member who has not arrived has nowhere else to be sent", () => {
    const mail = render();
    expect(mail.html).toContain("https://example.test");
    expect(mail.text).toContain(SAMPLE_ORG.name);
  });

  it("greets the person by the name the admin typed", () => {
    expect(render().html).toContain("ضيف من خارج المؤسسة");
  });
});
