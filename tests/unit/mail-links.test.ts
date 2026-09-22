// ★ NAMED DIFFERENCE 1 — `{{url}}` (REQ-NTF-004, DEC-161).
//
// The binding twenty-one default templates end on, which nothing has ever
// supplied. These cases fix the two halves of the answer: with no `APP_URL`
// the bytes are TODAY'S, and with one the link is absolute and correct.
import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES, linkFor, renderEmail, ROUTE_FOR, sampleFor, SAMPLE_MEMBER, SAMPLE_ORG } from "@kareem/mail-runtime";


const APP = "https://kareem.pp.sa";
const KEYS = Object.keys(DEFAULT_TEMPLATES);
const render = (key: string, appUrl?: string, payload?: Record<string, unknown>) =>
  renderEmail({
    key,
    payload: payload ?? sampleFor(key)!.payload,
    member: SAMPLE_MEMBER,
    org: SAMPLE_ORG,
    appUrl,
  });

describe("★ unset is today — an origin nobody configured changes nothing", () => {
  it("null and the empty string are both «unset» — half an origin is a broken link", () => {
    for (const origin of [null, undefined, ""]) {
      expect(linkFor("MSG-reminder_1d", { session_id: "s1" }, origin)).toBeNull();
    }
  });
});

describe("★ with an origin, the link is absolute and names the right page", () => {
  it("the session family lands on the event page; the two action mails land on their sub-page", () => {
    const s = { session_id: "11111111-1111-4111-8111-111111111111" };
    expect(linkFor("MSG-reminder_1d", s, APP)).toBe(`${APP}/ar/app/sessions/${s.session_id}`);
    expect(linkFor("MSG-session_changed", s, APP)).toBe(`${APP}/ar/app/sessions/${s.session_id}`);
    expect(linkFor("MSG-rating_prompt", s, APP)).toBe(`${APP}/ar/app/sessions/${s.session_id}/rate`);
    expect(linkFor("MSG-materials_added", s, APP)).toBe(`${APP}/ar/app/sessions/${s.session_id}/materials`);
  });

  it("a proposal mail lands on the proposal, and a recognition mail on the member's own page", () => {
    const p = { proposal_id: "22222222-2222-4222-8222-222222222222" };
    expect(linkFor("MSG-proposal_approved", p, APP)).toBe(`${APP}/ar/app/propose/${p.proposal_id}`);
    // No id in the payload at all — the route carries the whole path.
    expect(linkFor("MSG-badge_earned", { badge: "أول جلسة" }, APP)).toBe(`${APP}/ar/app/me/points`);
    expect(linkFor("MSG-level_reached", { level: 7 }, APP)).toBe(`${APP}/ar/app/me/points`);
    expect(linkFor("MSG-certificate_issued", { serial: "KM-000001" }, APP)).toBe(`${APP}/ar/app/me/certificates`);
    expect(linkFor("MSG-export_ready", {}, APP)).toBe(`${APP}/ar/app/me/privacy`);
  });

  it("a trailing slash on `APP_URL` does not produce a double slash", () => {
    expect(linkFor("MSG-badge_earned", {}, "https://kareem.pp.sa///")).toBe(`${APP}/ar/app/me/points`);
  });

  it("★ a route whose id is missing yields NULL, never `/app/sessions/undefined`", () => {
    expect(linkFor("MSG-reminder_1d", {}, APP)).toBeNull();
    expect(linkFor("MSG-reminder_1d", { session_id: "" }, APP)).toBeNull();
    expect(linkFor("MSG-reminder_1d", { session_id: 7 }, APP)).toBeNull();
    // And the mail still sends — it simply ends where it ends today.
    expect(() => render("MSG-reminder_1d", APP, { title: "عنوان" })).not.toThrow();
  });

  it("a key with no route is null, and no template of one interpolates `{{url}}`", () => {
    for (const key of KEYS) {
      const usesUrl = DEFAULT_TEMPLATES[key].body.includes("{{url}}");
      expect(Boolean(ROUTE_FOR[key]), `${key} route/binding agreement`).toBe(usesUrl);
    }
    // Twenty-one of twenty-five, which is the count `08` §3.2 implies and the
    // pinned files show ending on a blank line.
    expect(Object.keys(ROUTE_FOR)).toHaveLength(21);
  });
});

describe("the rendered message carries it", () => {
  it("both parts gain the link — a text-only reader is not left without one", () => {
    const out = render("MSG-reminder_1d", APP);
    const link = `${APP}/ar/app/sessions/${sampleFor("MSG-reminder_1d")!.payload.session_id}`;
    expect(out.text).toContain(link);
    expect(out.html).toContain(link);
  });

  it("★ a payload that carries its own `url` overrules the map", () => {
    // `0073`'s export may one day ship a signed link; a map must not overrule
    // a sender that knows better.
    const signed = "https://storage.example/export.zip?token=abc";
    expect(render("MSG-export_ready", APP, { url: signed }).text).toContain(signed);
  });

  it("the link is escaped like every other value — a payload is not markup", () => {
    const out = render("MSG-proposal_approved", APP, { title: "<b>x</b>", proposal_id: "33333333-3333-4333-8333-333333333333" });
    expect(out.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
