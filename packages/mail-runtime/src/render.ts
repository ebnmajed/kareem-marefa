// Rendering an email. 08 §3.1, A30, REQ-INT-006, ★ REQ-NTF-018 / DEC-289 (the approved dark design).
//
// Five constraints that are not negotiable, each with a client that breaks
// without it:
//
//   · tables for layout and inline CSS — email clients in 2026 still do not
//     support modern CSS reliably;
//   · `dir="rtl"` on <html> AND on every table cell — Outlook ignores
//     inherited direction more often than it honours it;
//   · ★ the product's face LOADED, with a stack that shapes Arabic where it is
//     stripped (`DEC-289` amends this line's old «never a web font»): Apple Mail,
//     iOS and Outlook.com render Baloo Bhaijaan 2, Gmail falls back to Segoe UI
//     and Tahoma;
//   · Western digits, always — REQ-INT-006, DEC-124, like every other surface;
//   · a plain-text alternative for every message — some corporate clients
//     strip HTML entirely.
//
// And one rule inherited from 10-i18n-rtl.md: never `overflow: hidden` on a
// text line (it clips tashkeel), never letter-spacing on Arabic, line-height
// 1.7 on body text.

import { DEFAULT_TEMPLATES, SIGNATURE, type EmailTemplate } from "./templates.js";
import { escapeHtml, formatNumber, formatValue, lookup } from "./primitives.js";
import { isBlockDocument, type DroppedBlock, type EmailBlockDocument } from "./blocks.js";
import { documentFromText, platformDesign, preheaderFor } from "./designs.js";
import { LOGO_PATH, MAIL, MAIL_FONT_LINK, t } from "./theme.js";
import { formatFacts } from "./facts.js";
import { designLinks, linkFor } from "./links.js";
import { compileBlocks, isolate, type CompilePalette } from "./compile.js";

export interface RenderInput {
  key: string;
  /** The org admin's template, when one exists (REQ-NTF-007).
   *
   *  ★ `blocks` is `notification_templates.blocks` (`0125`): a document is
   *  compiled as it is; **null is an admin's STRING template**, whose words
   *  `emailDocumentFor()` frames as paragraphs (`DEC-081`). No override at all
   *  is the key's platform design. */
  override?: { subject: string | null; body: string | null; blocks?: unknown | null } | null;
  payload: Record<string, unknown>;
  member: { name: string | null; email: string };
  org: { name: string; timeZone: string };
  /** The org brand kit's light palette (06 §8.3's email-template leg, DEC-052),
   *  read from `public.brand_kit()` by the sender. Absent in a unit test, the
   *  renderer keeps its neutral defaults — the identity override again.
   *
   *  ★ The three-key shape is the one the worker sent before wave 10 and it
   *  still works. The wider shape carries what a DESIGN needs and `brand_kit()` has returned since
   *  `0068`/`0093`: the nine tokens, and the logo's public URL (`0126`). */
  brand?: LegacyBrand | FullBrand | null;
  /** `0126` / contract 9: the public logo URL, when an ACTIVE org has one that
   *  is PNG or JPEG. **Null renders the org's NAME as a heading** — a WebP logo
   *  and an org with none both land here, and every design is correct with no
   *  image. */
  logoUrl?: string | null;
  /** The app's public origin, for the links a DESIGN carries — the footer's
   *  preference link above all (`REQ-NTF-005`). The worker reads `APP_URL`; the
   *  preview passes its own origin. Unset, a button is dropped and the footer
   *  carries no link — never a relative one. */
  appUrl?: string | null;
  /** Wave 23 — the editor's canvas only (`CompileContext.annotate`). Never set
   *  by the worker, so nothing sent carries it. */
  annotate?: boolean;
  /** ★ Wave 30 (`REQ-NTF-019`): the signed one-click link that switches this
   *  message's category off — present only for a message a member may switch
   *  off (`08` §1.7's set never carries one). Null: the footer has the settings
   *  link alone. */
  unsubscribeUrl?: string | null;
}

/** What `main`'s worker sends, and what `render.ts` has taken since M3. */
export interface LegacyBrand {
  fgBody: string;
  fgMuted: string;
  surface: string;
}

/** One scheme of `public.brand_kit()`. */
export interface BrandPalette {
  canvas?: string;
  surface?: string;
  fgHeading?: string;
  fgBody?: string;
  fgMuted?: string;
  edge?: string;
  edgeStrong?: string;
  spine?: string;
  node?: string;
  canvasRaise?: string;
}

export interface FullBrand {
  light: BrandPalette;
  dark?: BrandPalette;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  /**
   * ★ Every row the mail LOST, so a caller can say which.
   *
   * `compileBlocks()` has always reported this and `renderEmail()` used to
   * discard it, so the editor's checks panel had nothing to read and would
   * have had to re-derive the drops with a second copy of `readDocument()`'s
   * rules. Two validators disagreeing about which blocks survived is the exact
   * failure the panel exists to prevent: an admin approving a mail that
   * silently lost a row.
   */
  dropped: DroppedBlock[];
}

export class TemplateMissingError extends Error {}


/**
 * `{{path}}` substitution, and nothing else — no conditionals, no loops.
 *
 * An unresolved placeholder becomes an empty string rather than staying as
 * `{{member.name}}` in a member's inbox: `REQ-NTF-007`'s validation already
 * refuses to SAVE a template whose body omits a declared required field, so
 * an empty value here means the payload lacked something optional, and a
 * blank reads better than a leaked template variable.
 */
export function interpolate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => formatValue(lookup(payload, path)));
}

export interface ChangedField {
  label: string;
  from: string;
  to: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// The day words — contract 7's ordinals, in the worker.
//
// ★ WHY A SECOND COPY. `src/components/sessions/day-label.ts` is the one
// formatter every SCREEN shares, and the worker is a standalone package that
// imports nothing from `src/` — it has no next-intl, no message loader and no
// bundler that reaches across. So the words live here too, and
// `tests/unit/mail-day-words.test.ts` diffs this table against
// `src/messages/ar/sessions.json`'s `days.ordinal.*` so the two cannot drift.
// Same treatment `tests/unit/mail-render.test.ts` gives the template table
// against the matrix in migration `0026`.
//
// Words to ten, the Western digit from eleven — `day-label.ts`'s rule and
// DEC-124's numerals, so a mail and a screen switch at the same number.
// ═══════════════════════════════════════════════════════════════════════════
export const DAY_ORDINALS: readonly string[] = [
  "الأول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
];

/** «اليوم الثاني», and «اليوم 11» from eleven. */
export function dayPhrase(position: number): string {
  const named = Number.isInteger(position) && position >= 1 && position <= DAY_ORDINALS.length;
  return named ? `اليوم ${DAY_ORDINALS[position - 1]}` : `اليوم ${formatNumber(position)}`;
}

/**
 * The day line a reminder carries, and the empty string when there is nothing
 * to tell apart.
 *
 * ★ A session with ONE day produces `""`, which `toParagraphs()` drops — so a
 * one-day reminder is byte-identical to the one M3 shipped. Same mechanism
 * `{{tasks}}` already uses: the template has no conditionals, so a block that
 * may be absent is a pre-built value that may be empty.
 */
export function dayBlock(payload: Record<string, unknown>): string {
  const position = Number(payload.dayPosition);
  const count = Number(payload.dayCount);
  if (!Number.isInteger(position) || !Number.isInteger(count) || count <= 1 || position < 1) return "";
  return `${dayPhrase(position)} من ${formatNumber(count)}`;
}

/**
 * 08 §3.3 / REQ-SES-009: the old value and the new one, side by side.
 *
 * "Session details have changed, please check the page" makes the member do
 * the diffing, and some of them will not. **Only changed lines render** — a
 * venue change does not print an unchanged time — which is enforced here by
 * dropping any field whose two values are equal, rather than by trusting the
 * caller to send only what moved.
 */
export function changeBlock(changes: ChangedField[]): string {
  return changes
    .filter((c) => c.from !== c.to)
    .map((c) => `${c.label}: ${c.from} ← ${c.to}`)
    .join("\n");
}

/** 08 §3.3's fields, in Arabic. A field with no label here renders under
 *  its own name rather than being dropped — a change the member is not told
 *  about is the failure REQ-SES-009 exists to prevent.
 *
 *  `ends_at` and `days` are wave 9's: at several days the last meeting's end
 *  is not the session's, and a day added or removed reuses
 *  `MSG-session_changed` rather than a new key the matrix would refuse
 *  (DEC-151). */
const CHANGE_LABELS: Readonly<Record<string, string>> = {
  starts_at: "الموعد",
  ends_at: "الانتهاء",
  venue: "المكان",
  days: "عدد الأيام",
};

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/**
 * A raw value from the change trigger, in the org's zone and Western digits.
 *
 * The zone is the ORG's, not the reader's: a session happens in a room, and
 * «6:00 م» has to mean the clock on that room's wall whoever is reading the
 * mail. Same rule as components/sessions/numerals.ts, for the same reason.
 */
function formatChangeValue(value: unknown, org: RenderInput["org"]): string {
  if (value === null || value === undefined) return "—";
  const text = String(value);
  if (!ISO_INSTANT.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return new Intl.DateTimeFormat("ar-u-nu-latn", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: org.timeZone,
  }).format(parsed);
}

/**
 * ★ NAMED DIFFERENCE 4 (DEC-151) — an instant in a payload is FORMATTED.
 *
 * `{{startsAt}}` appears in seven of `08` §3.2's templates and has been
 * interpolated raw since M3, because `interpolate()` calls `String(value)` and
 * a trigger ships `jsonb_build_object('startsAt', s.starts_at)`. The mail a
 * member actually receives reads
 *
 *     الموعد: 2026-09-19T06:37:03.319767+00:00
 *
 * — measured with the exact string the local database produces, through this
 * renderer. `tests/unit/mail-render.test.ts` never caught it because its
 * fixtures pass a pre-formatted «الأحد 6:00 م».
 *
 * `formatChangeValue()` next door has always done the right thing for the
 * change block, so this applies the same rule to every top-level value: a
 * string that looks like an ISO instant is rendered in the ORG's zone with
 * Western digits, and everything else is left exactly as it is. A session
 * happens in a room, so the room's clock is the one that matters (OQ-018).
 */
function formatInstants(payload: Record<string, unknown>, org: RenderInput["org"]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = typeof value === "string" && ISO_INSTANT.test(value) ? formatChangeValue(value, org) : value;
  }
  return out;
}

/** The trigger ships raw values (supabase/proposed/notify/0005); the block is
 *  built here so the formatting rule lives in one place instead of in every
 *  trigger that reports a change. */
export function changesFromPayload(raw: unknown, org: RenderInput["org"]): string | null {
  if (!Array.isArray(raw)) return null;
  const fields = raw
    .filter((c): c is { field: string; from: unknown; to: unknown; day?: unknown; days?: unknown } =>
      Boolean(c) && typeof c === "object" && "field" in c,
    )
    .map((c) => ({
      label: changeLabel(c),
      from: formatChangeValue(c.from, org),
      to: formatChangeValue(c.to, org),
    }));
  return changeBlock(fields);
}

/**
 * «الموعد», and «الموعد · اليوم الثاني» when there is more than one meeting.
 *
 * ★ The qualifier is absent whenever `days` is missing or 1, so a one-day
 * session's block is the one M3 shipped, character for character. A session
 * with several days needs it: «تغيّر الموعد» on a three-day workshop that does
 * not say WHICH day sends someone to the wrong room on the wrong evening,
 * which is the failure `REQ-SES-009` exists to prevent.
 */
function changeLabel(change: { field: string; day?: unknown; days?: unknown }): string {
  const base = CHANGE_LABELS[change.field] ?? change.field;
  const position = Number(change.day);
  const count = Number(change.days);
  if (!Number.isInteger(position) || !Number.isInteger(count) || count <= 1 || position < 1) return base;
  return `${base} · ${dayPhrase(position)}`;
}

// ★ EXACTLY the brand kit's own constraint — `~* '^#[0-9a-f]{6}$'` on every
// one of its eighteen colour columns (`0068`, `0093`). `designer` caught the
// first version admitting 5- and 7-digit strings: an assertion that stands in
// for a database check and is LOOSER than it is a different rule wearing its
// name, and the gap is where the next widening lands.
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * ★ THE PLATFORM DEFAULT'S LIGHT SCHEME — THE THIRD COPY, AND NOW A NAMED ONE
 * (wave 24, `REQ-NTF-016`, `DEC-242` §2).
 *
 * These are the values a mail falls back to when the kit does not supply one:
 * no brand at all (a unit test), a half-filled kit, or the three-key shape the
 * worker sent before wave 10. They were written inline at ten call sites as
 * M6's navy, which is the palette `0192` replaced — so a mail rendered without
 * a kit looked like a product that no longer exists.
 *
 * ★ WHY THEY ARE STILL LITERALS. The platform default is defined in
 * `packages/designer-runtime/src/brand.ts` and in `public.brand_kit()`, and
 * `tests/rls/brand-kits.test.ts` holds those two equal. This package must not
 * import the document renderer — the worker's mail path has no business loading
 * it — so the third copy stays a literal and
 * `tests/unit/mail-palette-default.test.ts` is what holds it equal to the other
 * two. That test is this constant's `brand-kits.test.ts`, and `0155` is what it
 * looks like when a copy nobody watches is left behind.
 *
 * ★ IT IS A SANITISER'S DEFAULT, NOT A COLOUR THIS FILE CHOOSES. An org that
 * overrode its kit reaches none of these (`DEC-242` §6).
 *
 * ★ AND `ground`'s NEUTRAL IS NOT IN HERE, ON PURPOSE. `styles.ground` offers
 * `neutral` as a CHOICE beside `canvas` and `surface`; its grey is what
 * «neutral» MEANS, not a fallback for a missing value. Moving it would redefine
 * an option an admin picks and make `neutral` and `canvas` identical for every
 * org on the default — a vocabulary change, which this wave is not.
 */
export const PLATFORM_LIGHT = {
  canvas: '#f6f3ec',
  surface: '#ffffff',
  fgHeading: '#12131a',
  fgBody: '#12131a',
  fgMuted: '#5b5f73',
  edge: '#e4dfd3',
  // ★ The single accent (`DEC-242` §2 — `node` carries it, because exactly two
  //   accents exist and the other, coral, is a STATUS colour, which a brand
  //   token must never be). On a light ground it is lime-deep, and a mail is a
  //   light-scheme medium by declaration, so this is the lime an inbox ever
  //   shows.
  node: '#78ad12',
} as const;

/** A hex colour, or the default. See `compilePalette()` for why. */
function hex(value: string | undefined, fallback: string): string {
  return value !== undefined && HEX.test(value) ? value : fallback;
}

/**
 * The three values the shell has always used, from either brand shape.
 *
 * ★ For the three-key object this is the identity. For the wide one it
 * takes the LIGHT scheme, and only when all three are present: the same guard
 * `send_notification.ts` has applied since wave 4, so a half-filled kit falls
 * to the neutral defaults rather than to a half-branded mail.
 */
function legacyBrand(brand: RenderInput["brand"]): LegacyBrand | null | undefined {
  if (!brand) return brand;
  // ★ Asserted HERE and not only in `compilePalette()`, because these three
  // reach the shell's own `style=` unescaped by BOTH paths — a test planting a
  // `"><script>` in `fgBody` found the compiler guarded and the shell not.
  // Every real value is an anchored-hex column of the brand kit, so this
  // changes nothing that exists and closes what the type does not promise.
  const three = "fgBody" in brand ? brand : brand.light ?? {};
  return three.fgBody && three.fgMuted && three.surface
    ? { fgBody: hex(three.fgBody, PLATFORM_LIGHT.fgBody), fgMuted: hex(three.fgMuted, PLATFORM_LIGHT.fgMuted), surface: hex(three.surface, PLATFORM_LIGHT.surface) }
    : null;
}

/**
 * The palette a DESIGN needs, which is wider than the shell's three.
 *
 * ★ `accent` is `fgHeading`, not a new token. `public.brand_kit()` has nine and
 * none of them is a "primary": a dark fill with white text is the button the
 * kit can already describe, and inventing a tenth token would be a brand-kit
 * change (`branding`'s) for a contrast pair the kit already guarantees.
 */
/**
 * ★ EVERY PALETTE VALUE IS ASSERTED TO BE A HEX COLOUR, and falls back to the
 * default when it is not.
 *
 * `CompilePalette`'s fields reach fourteen `style=` and `bgcolor=` sites in
 * `compile.ts` **unescaped** — which is safe today only because every source is
 * an anchored-hex column of the brand kit or a literal in this file. That is a
 * property of the callers, not of the type, and the day someone widens
 * `CompilePalette` with a font name or a URL the hole opens silently.
 *
 * So it is checked here rather than trusted: a value that is not a hex colour
 * is replaced by the default, and `tests/unit/mail-blocks.test.ts` asserts a
 * planted non-hex never reaches the HTML.
 */
/**
 * ★ WAVE 30 — THE PALETTE IS THE DESIGN'S, AND NO KIT REACHES IT (`DEC-289`, `REQ-NTF-018`).
 *
 * Every mail is the approved dark design. The brand kit still arrives (the worker and the preview pass it, and
 * an old worker on a new package must not throw), and it is read by nothing. The tokens a block can name map onto
 * `build.py`'s: `surface` is the raised ground an inset sits on, `edge` the hairline.
 */
export const MAIL_PALETTE: CompilePalette = {
  fgBody: MAIL.text,
  fgMuted: MAIL.muted,
  fgHeading: MAIL.text,
  surface: MAIL.raised,
  edge: MAIL.line,
  accent: MAIL.lime,
  onAccent: MAIL.limeInk,
};

/** The light palette a kit described — kept for the record of `DEC-242` and no longer read by a mail. */
export function legacyCompilePalette(brand: RenderInput["brand"]): Omit<CompilePalette, "onAccent"> {
  const light: BrandPalette = brand && "light" in brand ? (brand.light ?? {}) : {};
  const legacy = legacyBrand(brand);
  const fgHeading = hex(light.fgHeading, PLATFORM_LIGHT.fgHeading);
  return {
    fgBody: hex(legacy?.fgBody, PLATFORM_LIGHT.fgBody),
    fgMuted: hex(legacy?.fgMuted, PLATFORM_LIGHT.fgMuted),
    surface: hex(legacy?.surface, PLATFORM_LIGHT.surface),
    fgHeading,
    edge: hex(light.edge, PLATFORM_LIGHT.edge),
    // ★ THE ACCENT IS `node`, AND UNTIL WAVE 24 THE MAIL HAD NO ACCENT AT ALL.
    //
    // It was `fgHeading`: the primary button was painted with the heading
    // colour and labelled in a hard-coded white, which reads as a dark slab and
    // is why nothing in a sent mail ever carried the product's accent. The
    // comment that stood here said a tenth token would be a brand-kit change
    // for a contrast pair the kit already guarantees — true when it was written,
    // and `DEC-242` §2 answers it: no token is added. `node` already exists,
    // already means «the accent», and is the one way the accent reaches a
    // document that refuses a hex literal.
    //
    // The button's LABEL moves with it, in the same commit — see
    // `bulletproofButton()` for the two ratios that make that mandatory.
    accent: hex(light.node, PLATFORM_LIGHT.node),
  };
}


/** The shell's own facts, beside the compiled rows. */
interface ShellInput {
  subject: string;
  preheader: string;
  /** The page a click on the mark opens — the app, or nothing without an origin. */
  appUrl: string | null;
  /** The host company — from the session's venue (`0180`) — at the header's inline end, or nothing. */
  company: string;
  settingsUrl: string | null;
  unsubscribeUrl: string | null;
  org: string;
  /** The document's own mobile rules (`mobileCss()`), when it asked for any. */
  head: string;
}

/** `build.py`'s `stripe()` — the four accents along the card's top edge. */
function stripe(): string {
  // ★ No `overflow:hidden` on the card (it would clip tashkeel on a text line — `10` §2), so nothing can clip a
  // full-width stripe to the card's 28 px corners. It is inset instead (the shell's row pads it 22 px a side), inside
  // the straight run of the top edge, with its own ends rounded — measured at 390 and 600 in Chromium.
  const cells = [MAIL.lime, MAIL.violet, MAIL.orange, MAIL.coral]
    .map((c, i) => `<td width="25%" height="4" style="height:4px;line-height:4px;font-size:0;background:${c};${i === 0 ? "border-radius:0 0 4px 0;" : i === 3 ? "border-radius:0 0 0 4px;" : ""}">&nbsp;</td>`)
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}

/** «المؤسسة · كريم معرفة · شارك المعرفة..» — and the product's name once, when the org IS the product. */
function signature(org: string): string {
  return SIGNATURE.startsWith(org.trim()) ? SIGNATURE : `${org} · ${SIGNATURE}`;
}

/** The preheader's padding: the zero-width joiners `build.py` uses, so a client shows the preheader and not the
 *  first words of the body after it. */
const PREHEADER_PAD = "&#847;&zwnj;&nbsp;".repeat(40);

/**
 * ★ THE ONE FRAME — `build.py`'s `HEAD` and `shell()`, verbatim in structure (`DEC-289`, `REQ-NTF-018`).
 *
 * Dark-native: `color-scheme: dark` is declared so a client does not invert the palette (the reason `DEC-289`
 * chose dark at all — the Gmail app cannot switch an adaptive mail cleanly). The page, the brand row (the hosted
 * PNG mark, «كريم معرفة», the host company), the card with its stripe, the compiled rows inside it, and the
 * composed footer below it: the settings link always, and «إيقاف هذه الرسائل» where the message may be switched
 * off (`REQ-NTF-005`, `REQ-NTF-019`). No document can remove the footer, because no document draws it.
 */
function shell(rows: string, input: ShellInput): string {
  const head = [
    `<head>`,
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<meta http-equiv="X-UA-Compatible" content="IE=edge">`,
    `<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">`,
    `<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,date=no,address=no">`,
    `<title>${escapeHtml(input.subject)}</title>`,
    `<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->`,
    `<link href="${MAIL_FONT_LINK}" rel="stylesheet">`,
    `<style>`,
    `:root{color-scheme:dark;supported-color-schemes:dark}`,
    `body{margin:0!important;padding:0!important;width:100%!important;background:${MAIL.page}}`,
    `table,td{mso-table-lspace:0;mso-table-rspace:0} img{-ms-interpolation-mode:bicubic;border:0;outline:none}`,
    `a{text-decoration:none}`,
    `@media (max-width:620px){`,
    `  .shell{width:100%!important} .px{padding-left:20px!important;padding-right:20px!important}`,
    `  .h1{font-size:26px!important} .hero{font-size:64px!important}`,
    `  .btn-wrap,.btn-wrap td{width:100%!important} .btn{display:block!important;text-align:center!important}`,
    `}`,
    `</style>`,
    input.head,
    `</head>`,
  ].join("\n");

  const mark = input.appUrl ? `<img src="${escapeHtml(`${input.appUrl}${LOGO_PATH}`)}" width="24" height="33" alt="" style="display:block">` : "";
  const brand =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    (mark ? `<td valign="middle">${mark}</td>` : "") +
    `<td valign="middle" style="padding-right:${mark ? 10 : 0}px;${t(19, 800, MAIL.text, 1)}">كريم معرفة</td></tr></table>`;
  const link = (label: string, href: string) => `<a href="${escapeHtml(href)}" style="${t(15, 600, MAIL.muted, 1)}text-decoration:none;">${label}</a>`;
  const footerLinks = [
    input.settingsUrl ? link("الإعدادات", input.settingsUrl) : "",
    input.unsubscribeUrl ? link("إيقاف هذه الرسائل", input.unsubscribeUrl) : "",
  ].filter(Boolean);

  return [
    `<!doctype html>`,
    `<html lang="ar" dir="rtl" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">`,
    head,
    `<body dir="rtl" style="margin:0;padding:0;background:${MAIL.page}" bgcolor="${MAIL.page}">`,
    // Hidden by display, never by `overflow:hidden` (`10` §2's rule is enforced on every byte of a mail).
    `<div style="display:none;max-height:0;max-width:0;opacity:0;font-size:1px;line-height:1px;mso-hide:all">${escapeHtml(input.preheader)}${PREHEADER_PAD}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MAIL.page}" style="background:${MAIL.page}" dir="rtl"><tr><td align="center" style="padding:28px 12px 40px">`,
    `<table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px" dir="rtl">`,
    `<tr><td style="padding:0 8px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`,
    `  <td valign="middle">${input.appUrl ? `<a href="${escapeHtml(input.appUrl)}" style="text-decoration:none">${brand}</a>` : brand}</td>`,
    `  <td valign="middle" align="left" style="${t(13, 600, MAIL.faint, 1)}">${escapeHtml(input.company)}</td>`,
    `</tr></table></td></tr>`,
    `<tr><td bgcolor="${MAIL.card}" style="background:${MAIL.card};border-radius:28px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    `<tr><td style="padding:0 22px">${stripe()}</td></tr>`,
    `<tr><td class="px" dir="rtl" align="right" style="padding:32px 32px 36px;text-align:right">`,
    `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    rows,
    `</table>`,
    `</td></tr>`,
    `</table></td></tr>`,
    `<tr><td align="center" style="padding:26px 16px 0">`,
    `  <div style="${t(13, 600, MAIL.faint, 1.8)}">${footerLinks.join("&nbsp;&nbsp;·&nbsp;&nbsp;")}</div>`,
    `  <div style="${t(12, 500, MAIL.faint, 1.8)}">${escapeHtml(signature(input.org))}</div>`,
    `</td></tr>`,
    `</table></td></tr></table>`,
    `</body></html>`,
    ``,
  ]
    .join("\n")
    // D3a item 2: every table states its direction — Outlook's Word engine does not inherit it.
    .replace(/<table role="presentation"(?![^>]*dir=)/g, '<table role="presentation" dir="rtl"')
    .replace(/<td(?=[\s>])(?![^>]*\bdir=)/g, '<td dir="rtl"');
}

/**
 * ★ WHAT IS COMPILED FOR A KEY — the one resolution, exported so a caller that
 * must know (the preview asks whether a card wants an image) asks the renderer
 * instead of re-deriving it (`DEC-081`, retired in M13):
 *
 *   · the row's `blocks`, when it has a document;
 *   · a row with `blocks` null — an admin's EDITED string template — its own
 *     words, in the design's frame (`documentFromText()`, `REQ-NTF-007`);
 *   · no row — every untouched org, every untouched key — the key's platform
 *     design (`REQ-NTF-014`: no key falls back to unstyled text).
 *
 * Null only for a key with no design at all, which is a matrix bug.
 */
export function emailDocumentFor(key: string, override: RenderInput["override"]): EmailBlockDocument | null {
  if (isBlockDocument(override?.blocks)) return override.blocks;
  if (override?.body) return documentFromText(override.body);
  return platformDesign(key);
}

/**
 * The org's row if it has one, the key's platform design otherwise
 * (REQ-NTF-002, REQ-NTF-007, REQ-NTF-014). A key with neither a subject nor a
 * document is a bug in the matrix, not a message to send blank, so it raises
 * and the job dead-letters with the key named.
 */
export function renderEmail(input: RenderInput): RenderedEmail {
  const fallback: EmailTemplate | undefined = DEFAULT_TEMPLATES[input.key];
  const subjectSource = input.override?.subject ?? fallback?.subject;
  const document = emailDocumentFor(input.key, input.override);
  if (!subjectSource || !document) {
    throw new TemplateMissingError(`no email template for ${input.key} — 08 §1 lists it with an email channel and 08 §3.2 must carry a template`);
  }

  // `member.name` and `org` are always resolvable, whatever the payload
  // carries: every default template greets by name, and a greeting that
  // renders «مرحبًا ،» is the failure mode this prevents.
  const changes = changesFromPayload(input.payload.changes, input.org);
  // ★ Wave 30: the design's date words — «الخميس», «1», «أكتوبر», «6:00 م» — derived HERE from the payload's own
  // `startsAt` when the sender did not word them, so a reminder shows its time in the preview, in a test and from an
  // old caller alike. The worker's facts (and anything a sender passed) win; nothing here overwrites a value.
  const derived = formatFacts({}, input.payload, input.org.timeZone);
  const payload: Record<string, unknown> = {
    ...Object.fromEntries(Object.entries(derived).filter(([k]) => input.payload[k] === undefined || input.payload[k] === null || input.payload[k] === "")),
    // Named difference 4: an ISO instant becomes a date a person can read.
    // Applied first, so `changes` and `day` below — both already strings — are
    // untouched by it.
    ...formatInstants(input.payload, input.org),
    ...(changes === null ? {} : { changes }),
    // Empty at one day, so the paragraph disappears and the mail is today's.
    // (The date strip's calendar day is `date_day`, wave 30 — a different binding, so an admin's `{{day}}` keeps
    // meaning «اليوم الثاني من 3».)
    day: dayBlock(input.payload),
    member: { ...(typeof input.payload.member === "object" && input.payload.member ? input.payload.member : {}), name: input.member.name ?? input.member.email, email: input.member.email },
    org: input.org.name,
  };

  // ★ Named difference 1. `linkFor()` is null without an origin, so the
  // spread adds nothing and `{{url}}` renders empty — and a button bound to it
  // is dropped rather than pointed somewhere relative. A payload that already
  // carries its own `url` keeps it: `0073`'s export may one day ship a signed
  // one, and a map must not overrule a sender that knows better.
  const url = input.payload.url ?? linkFor(input.key, input.payload, input.appUrl);
  if (url) payload.url = url;
  // ★ Wave 30: the design's other destinations, from the same ids (`designLinks()`); a sender's own value wins.
  for (const [name, href] of Object.entries(designLinks(input.payload, input.appUrl))) {
    if (payload[name] === undefined || payload[name] === null || payload[name] === "") payload[name] = href;
  }

  const subject = interpolate(subjectSource, payload).replace(/\s+/g, " ").trim();
  const origin = input.appUrl ? input.appUrl.replace(/\/+$/, "") : null;
  // ★ wave 20 (DEC-218 §2.5, D14): preferences live on `/app/me/settings` (SCR-029), no longer on the inbox.
  const settingsUrl = origin ? `${origin}/ar/app/me/settings` : null;

  // ★ ONE PATH (DEC-081). Every key resolved to a document above, so every
  // mail is compiled here — on the design's palette, whatever kit arrived (`DEC-289`).
  const compiled = compileBlocks(document, {
    payload,
    palette: MAIL_PALETTE,
    annotate: input.annotate === true,
    logoUrl: input.logoUrl ?? null,
    appOrigin: origin,
    preferencesUrl: settingsUrl,
    org: input.org.name,
  });
  const preheader = interpolate(preheaderFor(input.key), payload).replace(/\s+/g, " ").trim();
  const unsubscribeUrl = input.unsubscribeUrl ?? null;
  const footer = [
    settingsUrl ? `الإعدادات: ${isolate(settingsUrl)}` : "",
    unsubscribeUrl ? `إيقاف هذه الرسائل: ${isolate(unsubscribeUrl)}` : "",
  ].filter(Boolean);
  return {
    subject,
    text: `${[...compiled.text, ...(footer.length ? [footer.join("\n")] : [])].join("\n\n")}\n\n—\n${signature(input.org.name)}\n`,
    html: shell(compiled.rows.join("\n"), {
      subject,
      preheader: preheader !== "" ? preheader : subject,
      appUrl: origin,
      company: formatValue(lookup(payload, "company")),
      settingsUrl,
      unsubscribeUrl,
      org: input.org.name,
      head: compiled.head,
    }),
    dropped: compiled.dropped,
  };
}
