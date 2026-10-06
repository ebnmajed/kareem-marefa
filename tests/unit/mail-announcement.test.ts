// REQ-ADM-025 (DEC-267, 0213) — an org's announcement, sent once when it goes live.
//
// `public.publish_announcement()` calls `notify()` with `MSG-announcement_published` and the payload
// `{announcement_id, body}`; this pins that the key wears a design, that every binding its words read is one the
// database declares for it (`notification_bindings()`, read out of the migration — the trigger that refuses a
// template naming anything else), and that the one link lands on the member's home feed.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES, DESIGN_FOR, linkFor, platformDesign, renderEmail, sampleFor, SAMPLE_MEMBER, SAMPLE_ORG } from "@kareem/mail-runtime";

const KEY = "MSG-announcement_published";
const APP = "https://kareem.pp.sa";
const SQL = readFileSync(join(process.cwd(), "supabase", "migrations", "0213_event_types_and_announcements.sql"), "utf8");

/** The bindings 0213 declares for the key, plus the three every email message resolves. */
function declared(): Set<string> {
  const line = SQL.match(/\('MSG-announcement_published',\s*array\[([^\]]*)\]\)/);
  expect(line, "0213 declares the key's bindings").not.toBeNull();
  const own = [...line![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  return new Set([...own, "member.name", "member.email", "org"]);
}

const bindingsIn = (text: string) => [...text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]!);

describe("MSG-announcement_published", () => {
  it("is a matrix message with an email channel in 0213, in its own category", () => {
    expect(SQL).toMatch(/\('MSG-announcement_published',\s*'announcements',\s*true,\s*true,\s*true\s*\)/);
  });

  it("resolves to the announcement design, and has a template", () => {
    expect(DESIGN_FOR[KEY]).toBe("announcement");
    expect(platformDesign(KEY)).not.toBeNull();
    expect(DEFAULT_TEMPLATES[KEY]).toBeDefined();
  });

  it("reads only bindings the database declares for it — the design and the template both", () => {
    const allowed = declared();
    expect([...allowed].sort()).toEqual(["announcement_id", "body", "member.email", "member.name", "org", "url"]);
    const design = JSON.stringify(platformDesign(KEY));
    const template = DEFAULT_TEMPLATES[KEY]!;
    for (const b of [...bindingsIn(design), ...bindingsIn(template.subject), ...bindingsIn(template.body)]) {
      expect(allowed.has(b), b).toBe(true);
    }
    // The button binds `url`.
    expect(design).toContain('"urlBinding":"url"');
  });

  it("links to the member's home feed — the feed is where an announcement lives", () => {
    expect(linkFor(KEY, { announcement_id: "a1", body: "x" }, APP)).toBe(`${APP}/ar/app`);
  });

  it("renders the admin's text, the heading «إعلان», the button, and no session card", () => {
    const sample = sampleFor(KEY)!;
    const out = renderEmail({ key: KEY, payload: sample.payload, member: SAMPLE_MEMBER, org: SAMPLE_ORG, appUrl: APP });
    expect(out.subject).toBe("إعلان من كريم معرفة");
    expect(out.text).toContain(String(sample.payload.body));
    // The link is isolated (FSI … PDI), written by code point so no invisible character sits in this file.
    expect(out.text).toContain(`افتح المنصة: ${String.fromCharCode(0x2068)}${APP}/ar/app${String.fromCharCode(0x2069)}`);
    expect(out.html).toContain("إعلان");
    expect(out.html).not.toContain("{{");
    // No session — the card is a compiler rule on `session_id`, so nothing session-shaped is drawn.
    expect(out.html).not.toContain("/api/s/");
  });

  it("escapes what the admin typed", () => {
    const out = renderEmail({ key: KEY, payload: { announcement_id: "a1", body: "<script>alert(1)</script>" }, member: SAMPLE_MEMBER, org: SAMPLE_ORG, appUrl: APP });
    expect(out.html).not.toContain("<script>alert(1)</script>");
  });
});
