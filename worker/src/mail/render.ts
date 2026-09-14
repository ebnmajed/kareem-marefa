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
//   · numerals per the org setting, like every other surface;
//   · a plain-text alternative for every message — some corporate clients
//     strip HTML entirely.
//
// And one rule inherited from 10-i18n-rtl.md: never `overflow: hidden` on a
// text line (it clips tashkeel), never letter-spacing on Arabic, line-height
// 1.7 on body text.

import { DEFAULT_TEMPLATES, SIGNATURE, type EmailTemplate } from "./templates.js";

// The spelling is `public.numeral_system`'s own (migration 0003):
// 'western' | 'arabic_indic'. The worker reads `org_settings.numerals`
// straight out of the database, so it uses the database's value rather than
// a friendlier alias that would have to be mapped somewhere and would be
// mapped wrong somewhere else.
export type NumeralSystem = "western" | "arabic_indic";

export interface RenderInput {
  key: string;
  /** The org admin's template, when one exists (REQ-NTF-007). */
  override?: { subject: string | null; body: string | null } | null;
  payload: Record<string, unknown>;
  member: { name: string | null; email: string };
  org: { name: string; numerals: NumeralSystem; timeZone: string };
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export class TemplateMissingError extends Error {}

const FALLBACK_STACK = `'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif`;

function formatNumber(value: number, numerals: NumeralSystem): string {
  return new Intl.NumberFormat(numerals === "arabic_indic" ? "ar-u-nu-arab" : "ar-u-nu-latn").format(value);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Resolve `a.b.c` against the payload. */
function lookup(payload: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) return (node as Record<string, unknown>)[part];
    return undefined;
  }, payload);
}

/**
 * `{{path}}` substitution, and nothing else — no conditionals, no loops.
 *
 * An unresolved placeholder becomes an empty string rather than staying as
 * `{{member.name}}` in a member's inbox: `REQ-NTF-007`'s validation already
 * refuses to SAVE a template whose body omits a declared required field, so
 * an empty value here means the payload lacked something optional, and a
 * blank reads better than a leaked template variable.
 */
export function interpolate(template: string, payload: Record<string, unknown>, numerals: NumeralSystem): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = lookup(payload, path);
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return formatNumber(value, numerals);
    if (typeof value === "boolean") return value ? "نعم" : "لا";
    return String(value);
  });
}

export interface ChangedField {
  label: string;
  from: string;
  to: string;
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

/** 08 §3.3's two fields, in Arabic. A field with no label here renders under
 *  its own name rather than being dropped — a change the member is not told
 *  about is the failure REQ-SES-009 exists to prevent. */
const CHANGE_LABELS: Readonly<Record<string, string>> = {
  starts_at: "الموعد",
  venue: "المكان",
};

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/**
 * A raw value from the change trigger, in the org's zone and numerals.
 *
 * The zone is the ORG's, not the reader's: a session happens in a room, and
 * «٦:٠٠ م» has to mean the clock on that room's wall whoever is reading the
 * mail. Same rule as components/sessions/numerals.ts, for the same reason.
 */
function formatChangeValue(value: unknown, org: RenderInput["org"]): string {
  if (value === null || value === undefined) return "—";
  const text = String(value);
  if (!ISO_INSTANT.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return new Intl.DateTimeFormat(`ar-u-nu-${org.numerals === "arabic_indic" ? "arab" : "latn"}`, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: org.timeZone,
  }).format(parsed);
}

/** The trigger ships raw values (supabase/proposed/notify/0005); the block is
 *  built here so the formatting rule lives in one place instead of in every
 *  trigger that reports a change. */
export function changesFromPayload(raw: unknown, org: RenderInput["org"]): string | null {
  if (!Array.isArray(raw)) return null;
  const fields = raw
    .filter((c): c is { field: string; from: unknown; to: unknown } => Boolean(c) && typeof c === "object" && "field" in c)
    .map((c) => ({
      label: CHANGE_LABELS[c.field] ?? c.field,
      from: formatChangeValue(c.from, org),
      to: formatChangeValue(c.to, org),
    }));
  return changeBlock(fields);
}

function toParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Tables for layout, `dir="rtl"` on every cell, inline CSS only. */
function toHtml(paragraphs: string[], org: string): string {
  const cell = `dir="rtl" align="right" style="font-family:${FALLBACK_STACK};font-size:17px;line-height:1.7;color:#1a1a1a;padding:0 0 16px 0;text-align:right;"`;
  const rows = paragraphs
    .map((p) => `      <tr><td ${cell}>${escapeHtml(p).replace(/\n/g, "<br />")}</td></tr>`)
    .join("\n");

  return [
    `<!doctype html>`,
    `<html dir="rtl" lang="ar">`,
    `<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>`,
    `<body dir="rtl" style="margin:0;padding:0;background:#f5f5f5;">`,
    `  <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:24px 0;">`,
    `    <tr><td dir="rtl" align="center">`,
    `      <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:24px;">`,
    rows,
    `        <tr><td ${cell.replace("padding:0 0 16px 0", "padding:16px 0 0 0")} >`,
    `          <span style="font-size:13px;color:#6b6b6b;">${escapeHtml(org)} · ${escapeHtml(SIGNATURE)}</span>`,
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
    ...input.payload,
    ...(changes === null ? {} : { changes }),
    member: { ...(typeof input.payload.member === "object" && input.payload.member ? input.payload.member : {}), name: input.member.name ?? input.member.email, email: input.member.email },
    org: input.org.name,
  };

  const subject = interpolate(subjectSource, payload, input.org.numerals).replace(/\s+/g, " ").trim();
  const body = interpolate(bodySource, payload, input.org.numerals);
  const paragraphs = toParagraphs(body);

  return {
    subject,
    text: `${paragraphs.join("\n\n")}\n\n—\n${input.org.name} · ${SIGNATURE}\n`,
    html: toHtml(paragraphs, input.org.name),
  };
}
