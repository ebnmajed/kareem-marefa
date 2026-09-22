import { describe, expect, it } from "vitest";
import { compileBlocks, SCHEMA_VERSION, type EmailBlock } from "@kareem/mail-runtime";

// A long unbroken run — a bare URL in an admin's own words — wraps inside its
// cell instead of widening the mail past a phone (the N1 review measured
// 488 px at 390). DEC-081, REQ-NTF-014.
const ctx = {
  payload: { url: "https://app.kareem.example/ar/app/sessions/11111111-1111-4111-8111-111111111111" },
  palette: { fgBody: "#1a1a1a", fgMuted: "#6b6b6b", fgHeading: "#0b1220", surface: "#ffffff", edge: "#e6eaf0", accent: "#0b1220" },
  logoUrl: null,
  preferencesUrl: null,
  appOrigin: null,
  org: "كريم معرفة",
};
const compile = (...blocks: EmailBlock[]) => compileBlocks({ schemaVersion: SCHEMA_VERSION, blocks }, ctx);

describe("an author's cells wrap a long unbroken run", () => {
  it("a paragraph's cell declares both wrap properties, and never clips", () => {
    const [row] = compile({ type: "paragraph", id: "p1", text: "أحضر أسئلتك.\n{{url}}" }).rows;
    expect(row).toContain("overflow-wrap:anywhere;word-break:break-word;");
    expect(row).not.toContain("overflow:hidden");
  });

  it("a detail list's VALUE cell wraps; its label cell is unchanged", () => {
    const [row] = compile({ type: "detail_list", id: "d1", items: [{ label: "الرابط", value: "{{url}}" }] }).rows;
    const cells = row!.match(/<td [^>]*>/g)!;
    expect(cells.filter((c) => c.includes("overflow-wrap:anywhere"))).toHaveLength(1);
    expect(cells.at(-1)).toContain("overflow-wrap:anywhere;word-break:break-word;");
  });

  it("the text part is untouched — wrapping is presentation", () => {
    const out = compile({ type: "paragraph", id: "p1", text: "{{url}}" });
    expect(out.text[0]).not.toContain("overflow");
  });
});
