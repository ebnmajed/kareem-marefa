// The approved email design's tokens — `REQ-NTF-018`, `DEC-289`.
//
// ★ THE SPEC IS `docs/design/emails/build.py`, and this holds the renderer to it: every colour of its `C` table and
// its font stack, parsed out of the file rather than restated, so the design and the renderer cannot drift.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAIL, MAIL_FONT, MAIL_FONT_LINK } from "@kareem/mail-runtime";

const BUILD = readFileSync(join(process.cwd(), "docs", "design", "emails", "build.py"), "utf8");

/** `C = dict(page='#0E0E12', …)` → { page: "#0E0E12", … }, snake_case kept. */
function tokens(): Record<string, string> {
  const block = BUILD.match(/C = dict\(([\s\S]*?)\)\n/)![1]!;
  return Object.fromEntries([...block.matchAll(/(\w+)='(#[0-9A-Fa-f]{6})'/g)].map((m) => [m[1]!, m[2]!]));
}
const camel = (s: string) => s.replace(/_(\w)/g, (_m, c: string) => c.toUpperCase());

describe("the renderer wears build.py's tokens, verbatim", () => {
  it("every colour of `C` is in MAIL under its own name, with its own value", () => {
    const c = tokens();
    expect(Object.keys(c).length).toBe(16);
    for (const [name, hex] of Object.entries(c)) {
      expect((MAIL as Record<string, string>)[camel(name)], name).toBe(hex);
    }
    expect(Object.keys(MAIL).sort()).toEqual(Object.keys(c).map(camel).sort());
  });

  it("the font stack is `FONT`, and the face is loaded by the same Google Fonts link", () => {
    expect(BUILD).toContain(`FONT = "${MAIL_FONT}"`);
    expect(BUILD).toContain(`<link href="${MAIL_FONT_LINK}" rel="stylesheet">`);
  });

  it("the hosted mark is the PNG in the design's assets — never an SVG (invariant 11)", () => {
    const shipped = readFileSync(join(process.cwd(), "public", "email", "logo-mark@2x.png"));
    const spec = readFileSync(join(process.cwd(), "docs", "design", "emails", "assets", "logo-mark@2x.png"));
    expect(shipped.equals(spec)).toBe(true);
    expect(shipped.subarray(1, 4).toString("ascii")).toBe("PNG");
  });
});
