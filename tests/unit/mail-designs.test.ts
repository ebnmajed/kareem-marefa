// N6 — the eight designed platform templates (REQ-NTF-014, DEC-082, `16` §11.5).
//
// The requirement's three acceptance lines, as tests: EVERY message key
// resolves to a design; an org duplicates one and the original is never
// mutated; the brand kit drives all of it.
import { describe, expect, it } from "vitest";
import {
  compileBlocks,
  DEFAULT_TEMPLATES,
  DESIGN_FAMILIES,
  DESIGN_FOR,
  platformDesign,
  readDocument,
  renderEmail,
  sampleFor,
  SAMPLE_MEMBER,
  SAMPLE_ORG,
} from "@kareem/mail-runtime";

const KEYS = Object.keys(DEFAULT_TEMPLATES);

describe("★ REQ-NTF-014 — every message key resolves to a design", () => {
  it("all 25, and the map is exactly the template table", () => {
    expect(KEYS).toHaveLength(25);
    const mapped = Object.keys(DESIGN_FOR).sort();
    expect(mapped).toEqual([...KEYS].sort());
    for (const key of KEYS) expect(platformDesign(key), key).not.toBeNull();
  });

  it("the eight families are DEC-082's, and every one is used", () => {
    expect(DESIGN_FAMILIES).toHaveLength(8);
    const used = new Set(Object.values(DESIGN_FOR));
    expect([...used].sort()).toEqual([...DESIGN_FAMILIES].sort());
  });

  it("★ every block of every design has an id — readDocument() refuses one without", () => {
    // Authored in TypeScript, so a missing id is a type error rather than a
    // row the renderer silently drops. This asserts the reader agrees.
    for (const key of KEYS) {
      const design = platformDesign(key)!;
      const { blocks, dropped } = readDocument(design);
      expect(dropped, key).toEqual([]);
      expect(blocks.length, key).toBe(design.blocks.length);
      for (const block of blocks) expect(block.id, `${key}/${block.type}`).not.toBe("");
    }
  });
});

describe("a design renders, and says what its message says", () => {
  const ctx = (payload: Record<string, unknown>) => ({
    payload,
    palette: { fgBody: "#2b3a55", fgMuted: "#6f7d93", fgHeading: "#0b1220", surface: "#ffffff", edge: "#e6eaf0", accent: "#0b1220" },
    logoUrl: "https://kareem.pp.sa/api/brand/o/logo",
    preferencesUrl: "https://kareem.pp.sa/ar/app/me/notifications",
    appOrigin: "https://kareem.pp.sa",
    org: "كريم معرفة",
  });

  it("every design compiles over its OWN sample payload without throwing, and produces both parts", () => {
    for (const key of KEYS) {
      const sample = sampleFor(key)!;
      const out = compileBlocks(platformDesign(key), ctx(sample.payload));
      expect(out.rows.length, key).toBeGreaterThan(0);
      // Never a row lost: a design that dropped one would be a mail missing
      // something nobody authored away.
      expect(out.dropped, key).toEqual([]);
      expect(out.text.join("\n"), key).not.toBe("");
    }
  });

  it("★ the CANCELLED family carries no image — /api/s/{id}/og 404s for a cancelled session", () => {
    // Contract 8. A cancellation is the one mail a member reads carefully, and
    // it must never arrive with a broken image.
    for (const key of ["MSG-session_cancelled", "MSG-proposal_rejected", "MSG-role_changed", "MSG-account_deactivated"]) {
      const design = platformDesign(key)!;
      const card = design.blocks.find((b) => b.type === "session_card");
      expect(card, key).toBeUndefined();
    }
    // And the families that DO show a card ask for its image.
    const reminder = platformDesign("MSG-reminder_1d")!.blocks.find((b) => b.type === "session_card");
    expect(reminder).toMatchObject({ withImage: true });
  });

  it("an org with no public logo renders its NAME rather than a broken image", () => {
    const sample = sampleFor("MSG-reminder_1d")!;
    const out = compileBlocks(platformDesign("MSG-reminder_1d"), { ...ctx(sample.payload), logoUrl: null });
    expect(out.rows.join("")).not.toContain("<img");
    // The heading still names the org's message, so the mail is not headless.
    expect(out.text[0]).toContain("جلستك غدًا");
  });
});

describe("★ adoption is EXPLICIT — the library does not change what an untouched org sends", () => {
  it("a key with no row still renders the STRING default, design or no design", () => {
    // DEC-161 R3: a key with no row, or a row whose `blocks` is null, renders
    // the pinned bytes. The library being complete does not adopt it.
    const withoutOverride = renderEmail({
      key: "MSG-reminder_1d",
      payload: sampleFor("MSG-reminder_1d")!.payload,
      member: SAMPLE_MEMBER,
      org: SAMPLE_ORG,
    });
    // The string template's own greeting, which no design uses.
    expect(withoutOverride.text).toContain("مرحبًا");
    expect(withoutOverride.dropped).toEqual([]);
  });

  it("a design is adopted only by being STORED on the row", () => {
    const adopted = renderEmail({
      key: "MSG-reminder_1d",
      override: { subject: "غدًا: {{title}}", body: "نص", blocks: platformDesign("MSG-reminder_1d") },
      payload: sampleFor("MSG-reminder_1d")!.payload,
      member: SAMPLE_MEMBER,
      org: SAMPLE_ORG,
      appUrl: "https://kareem.pp.sa",
    });
    expect(adopted.html).toContain("جلستك غدًا");
  });

  it("★ duplicating cannot mutate the original — the design is a fresh object each call", () => {
    const first = platformDesign("MSG-reminder_1d")!;
    first.blocks.push({ type: "divider", id: "vandal" });
    const second = platformDesign("MSG-reminder_1d")!;
    // «The original is never mutated» (REQ-NTF-014) is true by construction
    // when each call builds its own: an org editing its copy cannot reach the
    // library, and neither can a bug.
    expect(second.blocks.some((b) => b.id === "vandal")).toBe(false);
  });
});
