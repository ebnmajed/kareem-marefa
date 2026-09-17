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
import { escapeHtml, FALLBACK_STACK, formatNumber, formatValue, lookup } from "./primitives.js";
import { isBlockDocument } from "./blocks.js";
import { compileBlocks, type CompilePalette } from "./compile.js";

export interface RenderInput {
  key: string;
  /** The org admin's template, when one exists (REQ-NTF-007).
   *
   *  ★ `blocks` is `notification_templates.blocks` (`0125`): **null is a STRING
   *  template** — every row that existed before wave 10 — and the string path
   *  below renders it byte for byte. A document takes the block path instead
   *  (`REQ-NTF-009`). Additive and optional, so `renderEmail()`'s signature is
   *  the one `main`'s worker calls (contract 4). */
  override?: { subject: string | null; body: string | null; blocks?: unknown | null } | null;
  payload: Record<string, unknown>;
  member: { name: string | null; email: string };
  org: { name: string; timeZone: string };
  /** The org brand kit's light palette (06 §8.3's email-template leg, DEC-052),
   *  read from `public.brand_kit()` by the sender. Absent in a unit test, the
   *  renderer keeps its neutral defaults — the identity override again.
   *
   *  ★ The three-key shape is the one `main`'s worker sends and it keeps
   *  working unchanged, which is why the pinned files do not move. The wider
   *  shape carries what a DESIGN needs and `brand_kit()` has returned since
   *  `0068`/`0093`: the nine tokens, and the logo's public URL (`0126`). */
  brand?: LegacyBrand | FullBrand | null;
  /** `0126` / contract 9: the public logo URL, when an ACTIVE org has one that
   *  is PNG or JPEG. **Null renders the org's NAME as a heading** — a WebP logo
   *  and an org with none both land here, and every design is correct with no
   *  image. Ignored by the string path. */
  logoUrl?: string | null;
  /** The app's public origin, for the links a DESIGN carries — the footer's
   *  preference link above all (`REQ-NTF-005`). The worker reads `APP_URL`; the
   *  preview passes its own origin. ★ The string path does not read it, so its
   *  bytes are unchanged (named difference 1 is a separate change). */
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

function toParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * The three values the shell has always used, from either brand shape.
 *
 * ★ For the three-key object — what `main`'s worker sends — this is the
 * identity, which is why the pinned files do not move. For the wide one it
 * takes the LIGHT scheme, and only when all three are present: the same guard
 * `send_notification.ts` has applied since wave 4, so a half-filled kit falls
 * to the neutral defaults rather than to a half-branded mail.
 */
function legacyBrand(brand: RenderInput["brand"]): LegacyBrand | null | undefined {
  if (!brand) return brand;
  if ("fgBody" in brand) return brand;
  const light = brand.light ?? {};
  return light.fgBody && light.fgMuted && light.surface ? { fgBody: light.fgBody, fgMuted: light.fgMuted, surface: light.surface } : null;
}

/**
 * The palette a DESIGN needs, which is wider than the shell's three.
 *
 * ★ `accent` is `fgHeading`, not a new token. `public.brand_kit()` has nine and
 * none of them is a "primary": a dark fill with white text is the button the
 * kit can already describe, and inventing a tenth token would be a brand-kit
 * change (`branding`'s) for a contrast pair the kit already guarantees.
 */
function compilePalette(brand: RenderInput["brand"]): CompilePalette {
  const light: BrandPalette = brand && "light" in brand ? (brand.light ?? {}) : {};
  const legacy = legacyBrand(brand);
  const fgHeading = light.fgHeading ?? "#0b1220";
  return {
    fgBody: legacy?.fgBody ?? "#1a1a1a",
    fgMuted: legacy?.fgMuted ?? "#6b6b6b",
    surface: legacy?.surface ?? "#ffffff",
    fgHeading,
    edge: light.edge ?? "#e6eaf0",
    accent: fgHeading,
  };
}

/** Tables for layout, `dir="rtl"` on every cell, inline CSS only. */
function toHtml(paragraphs: string[], org: string, brand?: LegacyBrand | null): string {
  const fgBody = brand?.fgBody ?? "#1a1a1a";
  const cell = `dir="rtl" align="right" style="font-family:${FALLBACK_STACK};font-size:17px;line-height:1.7;color:${fgBody};padding:0 0 16px 0;text-align:right;"`;
  const rows = paragraphs
    .map((p) => `      <tr><td ${cell}>${escapeHtml(p).replace(/\n/g, "<br />")}</td></tr>`)
    .join("\n");
  return shell(rows, org, brand);
}

/**
 * The document both paths fill — the string path's paragraphs and the block
 * compiler's rows land in the SAME shell, so a change to the frame reaches
 * both and neither can drift.
 *
 * It is extracted rather than duplicated, and the 116 files under
 * `tests/unit/mail-pinned/` are what proves the extraction moved not one byte
 * of the string path's output.
 */
function shell(rows: string, org: string, brand?: LegacyBrand | null): string {
  const fgBody = brand?.fgBody ?? "#1a1a1a";
  const fgMuted = brand?.fgMuted ?? "#6b6b6b";
  const surface = brand?.surface ?? "#ffffff";
  const cell = `dir="rtl" align="right" style="font-family:${FALLBACK_STACK};font-size:17px;line-height:1.7;color:${fgBody};padding:0 0 16px 0;text-align:right;"`;

  return [
    `<!doctype html>`,
    `<html dir="rtl" lang="ar">`,
    `<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>`,
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
 * The org's template if it has one, the built-in Arabic default otherwise
 * (REQ-NTF-002, REQ-NTF-007). A key with neither is a bug in the matrix, not
 * a message to send blank, so it raises and the job dead-letters with the key
 * named.
 */
export function renderEmail(input: RenderInput): RenderedEmail {
  const fallback: EmailTemplate | undefined = DEFAULT_TEMPLATES[input.key];
  const subjectSource = input.override?.subject ?? fallback?.subject;
  const bodySource = input.override?.body ?? fallback?.body;
  if (!subjectSource || !bodySource) {
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

  const subject = interpolate(subjectSource, payload).replace(/\s+/g, " ").trim();

  // ★ THE BRANCH, AND IT IS THE ONLY ONE (REQ-NTF-009, DEC-081). A row whose
  // `blocks` is null — every row that existed before wave 10, and every org
  // that has not touched its templates — falls through to the string path
  // below, which is unchanged and which `tests/unit/mail-pinned/` pins byte for
  // byte. The string path is removed only when every key has a design, in M13.
  if (isBlockDocument(input.override?.blocks)) {
    const compiled = compileBlocks(input.override.blocks, {
      payload,
      palette: compilePalette(input.brand),
      logoUrl: input.logoUrl ?? null,
      preferencesUrl: input.appUrl ? `${input.appUrl.replace(/\/+$/, "")}/ar/app/me/notifications` : null,
      org: input.org.name,
    });
    return {
      subject,
      // The same tail the string path writes, so a design and a default sign
      // off identically.
      text: `${compiled.text.join("\n\n")}\n\n—\n${input.org.name} · ${SIGNATURE}\n`,
      html: shell(compiled.rows.join("\n"), input.org.name, legacyBrand(input.brand)),
    };
  }

  const body = interpolate(bodySource, payload);
  const paragraphs = toParagraphs(body);

  return {
    subject,
    text: `${paragraphs.join("\n\n")}\n\n—\n${input.org.name} · ${SIGNATURE}\n`,
    html: toHtml(paragraphs, input.org.name, legacyBrand(input.brand)),
  };
}
