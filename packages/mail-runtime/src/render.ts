// Rendering an email. 08 §3.1, A30, REQ-INT-006.
//
// Five constraints that are not negotiable, each with a client that breaks
// without it:
//
//   · tables for layout and inline CSS — email clients in 2026 still do not
//     support modern CSS reliably;
//   · `dir="rtl"` on <html> AND on every table cell — Outlook ignores
//     inherited direction more often than it honours it;
//   · a declared fallback font stack, not a web font — web fonts do not load
//     in most clients, so the mail is designed to look right in the fallback
//     rather than to depend on the brand face;
//   · Western digits, always — REQ-INT-006, DEC-124, like every other surface;
//   · a plain-text alternative for every message — some corporate clients
//     strip HTML entirely.
//
// And one rule inherited from 10-i18n-rtl.md: never `overflow: hidden` on a
// text line (it clips tashkeel), never letter-spacing on Arabic, line-height
// 1.7 on body text.

import { DEFAULT_TEMPLATES, SIGNATURE, type EmailTemplate } from "./templates.js";
import { DESIGN_STACK, escapeHtml, formatNumber, formatValue, lookup } from "./primitives.js";
import { isBlockDocument, type DroppedBlock, type EmailBlockDocument } from "./blocks.js";
import { documentFromText, platformDesign } from "./designs.js";
import { linkFor } from "./links.js";
import { compileBlocks, type CompilePalette } from "./compile.js";

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
    ? { fgBody: hex(three.fgBody, "#1a1a1a"), fgMuted: hex(three.fgMuted, "#6b6b6b"), surface: hex(three.surface, "#ffffff") }
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
function compilePalette(brand: RenderInput["brand"]): CompilePalette {
  const light: BrandPalette = brand && "light" in brand ? (brand.light ?? {}) : {};
  const legacy = legacyBrand(brand);
  const fgHeading = hex(light.fgHeading, "#0b1220");
  return {
    fgBody: hex(legacy?.fgBody, "#1a1a1a"),
    fgMuted: hex(legacy?.fgMuted, "#6b6b6b"),
    surface: hex(legacy?.surface, "#ffffff"),
    fgHeading,
    edge: hex(light.edge, "#e6eaf0"),
    accent: fgHeading,
  };
}

/**
 * The document every mail fills: the block compiler's rows, then the
 * signature. Since the string path left (`DEC-081`) there is one frame, and it
 * carries what D3 found the string path lacked — F1's declared `light` scheme
 * (Apple Mail and Outlook.com stop auto-inverting: an inverter that darkens a
 * background while leaving an explicit text colour alone produces dark text on
 * a dark card) and F4's declared Arabic faces for iOS and Android.
 */
function shell(rows: string, org: string, brand: LegacyBrand | null | undefined): string {
  const fgBody = brand?.fgBody ?? "#1a1a1a";
  const fgMuted = brand?.fgMuted ?? "#6b6b6b";
  const surface = brand?.surface ?? "#ffffff";
  const cell = `dir="rtl" align="right" style="font-family:${DESIGN_STACK};font-size:17px;line-height:1.7;color:${fgBody};padding:0 0 16px 0;text-align:right;"`;
  // The documented opt-out for Apple Mail and Outlook.com. Gmail on Android
  // inverts regardless, which is what the `bgcolor` attributes in `compile.ts`
  // are for.
  const head = `<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="color-scheme" content="light" /><meta name="supported-color-schemes" content="light" /><style>:root{color-scheme:light;supported-color-schemes:light;}</style></head>`;

  return [
    `<!doctype html>`,
    `<html dir="rtl" lang="ar">`,
    head,
    `<body dir="rtl" style="margin:0;padding:0;background:#f5f5f5;">`,
    `  <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:24px 0;">`,
    `    <tr><td dir="rtl" align="center">`,
    `      <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${surface};border-radius:12px;padding:24px;">`,
    rows,
    `        <tr><td ${cell.replace("padding:0 0 16px 0", "padding:16px 0 0 0")} >`,
    `          <span style="font-size:13px;color:${fgMuted};">${escapeHtml(org)} · ${escapeHtml(SIGNATURE)}</span>`,
    `        </td></tr>`,
    `      </table>`,
    `    </td></tr>`,
    `  </table>`,
    `</body>`,
    `</html>`,
    ``,
  ].join("\n");
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
  const payload: Record<string, unknown> = {
    // Named difference 4: an ISO instant becomes a date a person can read.
    // Applied first, so `changes` and `day` below — both already strings — are
    // untouched by it.
    ...formatInstants(input.payload, input.org),
    ...(changes === null ? {} : { changes }),
    // Empty at one day, so the paragraph disappears and the mail is today's.
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

  const subject = interpolate(subjectSource, payload).replace(/\s+/g, " ").trim();

  // ★ ONE PATH (DEC-081). Every key resolved to a document above, so every
  // mail is compiled here.
  const compiled = compileBlocks(document, {
    payload,
    palette: compilePalette(input.brand),
    logoUrl: input.logoUrl ?? null,
    appOrigin: input.appUrl ?? null,
    preferencesUrl: input.appUrl ? `${input.appUrl.replace(/\/+$/, "")}/ar/app/me/notifications` : null,
    org: input.org.name,
  });
  return {
    subject,
    text: `${compiled.text.join("\n\n")}\n\n—\n${input.org.name} · ${SIGNATURE}\n`,
    html: shell(compiled.rows.join("\n"), input.org.name, legacyBrand(input.brand)),
    dropped: compiled.dropped,
  };
}
