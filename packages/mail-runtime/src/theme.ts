// The mail's one look — `DEC-289`, `REQ-NTF-018`. The owner's approved design (`docs/design/emails/`, `build.py`).
//
// ★ DARK, AND FIXED. Every mail this product sends wears the same palette, the platform mark and «كريم معرفة» in
// its header. An org's brand kit no longer restyles mail (`DEC-289` amends `REQ-NTF-014` and `DEC-082`): most
// members read in the Gmail app, which cannot switch an adaptive mail cleanly between schemes, and the brand is
// built for dark. Posters and certificates still read the kit.
//
// ★ THE VALUES ARE `build.py`'s `C`, VERBATIM. `tests/unit/mail-theme.test.ts` parses `build.py` and holds every
// one of them equal to this table, so the spec and the renderer cannot drift. A colour is named here once and
// referenced everywhere else by name.
//
// ★ IT IS A LEAF MODULE, imported by the shell and the compiler alike — the reason `primitives.ts` exists.

import { DESIGN_STACK } from "./primitives.js";

export const MAIL = {
  page: "#0E0E12",
  card: "#16161C",
  raised: "#1F1F27",
  line: "#2B2B35",
  text: "#F5F5F7",
  muted: "#9C9CAB",
  faint: "#6B6B7A",
  lime: "#C6FF3D",
  limeInk: "#10140A",
  violet: "#9B7CFF",
  orange: "#FF9A2E",
  coral: "#FF6E4F",
  violetTint: "#262040",
  limeTint: "#23300F",
  orangeTint: "#3A2A14",
  coralTint: "#3A1F1A",
} as const;

/** The ink on each accent, from `build.py`'s call sites (`avatar(…, fg)`, `ticket(…, head_fg)`). */
export const INK_ON = {
  lime: MAIL.limeInk,
  violet: "#140F2A",
  orange: "#2A1600",
  coral: "#111111",
} as const;

/**
 * ★ THE ONE FACE, LOADED — `DEC-289` amends `08` §3.1's «never a web font».
 *
 * Baloo Bhaijaan 2 is the product's display face. Apple Mail, iOS Mail and Outlook.com load it through the
 * `<link>`; Gmail strips it and falls back to `Segoe UI` / `Tahoma` — both of which shape Arabic. The stack is
 * `build.py`'s `FONT`, verbatim.
 */
export const MAIL_FONT = DESIGN_STACK;
export const MAIL_FONT_LINK = "https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@400;500;600;700;800&display=swap";

/** `build.py`'s `t()`: a text run's inline style. */
export function t(size: number, weight = 400, color: string = MAIL.text, lh = 1.5, extra = ""): string {
  return `font-family:${MAIL_FONT};font-size:${size}px;line-height:${lh};font-weight:${weight};color:${color};${extra}`;
}

/** The platform mark, a hosted PNG under `public/email/` — Gmail draws no SVG (invariant 11). */
export const LOGO_PATH = "/email/logo-mark@2x.png";

/**
 * ★ ARABIC COUNTS, ALL SIX FORMS (`10` §2) — the same split CLDR's `ar` plural rules make. A count in a mail is a
 * word as often as a figure («12 مقعدًا متبقيًا», «مقعدان متبقيان»), and the renderer has no message catalogue.
 */
export interface ArabicForms {
  zero: string;
  one: string;
  two: string;
  few: string;
  many: string;
  other: string;
}

const pluralRules = new Intl.PluralRules("ar");

export function arabicCount(n: number, forms: ArabicForms, format: (n: number) => string): string {
  const form = pluralRules.select(n) as keyof ArabicForms;
  return (forms[form] ?? forms.other).replace("#", format(n));
}
