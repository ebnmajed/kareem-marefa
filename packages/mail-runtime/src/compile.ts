// The block-to-table compiler — REQ-NTF-009, REQ-NTF-013, 16 §11.3, §11.6.
//
// Each block compiles to ONE table row of the shell `render.ts` builds, and to
// its own lines of the plain-text alternative, IN THE SAME WALK. That is what
// makes REQ-NTF-013's «one edit changes both parts; they cannot drift» true by
// construction rather than by discipline: there is one traversal, and a block
// that forgets its text cannot compile.
//
// Reviewed against `designer`'s D3a list (contract 8), which was published
// before this was written so it could shape the compiler rather than audit it.
//
// ★ BIDI ISOLATION LIVES HERE, AND ONLY HERE.
//
// `<bdi>` is NOT supported by Outlook's Word engine (D3a item 3), so a bound
// value that can carry a name, a title, a venue or a code — a mixed-direction
// run inside an Arabic sentence — is isolated with the Unicode isolates
// U+2068 FIRST STRONG ISOLATE … U+2069 POP DIRECTIONAL ISOLATE, in the HTML
// **and** in the generated text part, which reorders without them.
//
// It must NOT move into `interpolate()`. That function is shared with the
// STRING path, and isolating there would change every default template's
// output and move all 116 files under `tests/unit/mail-pinned/` — for an org
// that has touched nothing, which is the one thing this wave promises not to
// do (REQ-NTF-009, contract 5). The two paths diverge here on purpose, and
// `tests/unit/mail-blocks.test.ts` asserts that they do.

import { DESIGN_STACK, escapeHtml, formatValue, lookup } from "./primitives.js";
import { readBlocks, type EmailBlock, type ImageSource } from "./blocks.js";

/** U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL ISOLATE. Written as
 *  escapes, never as the characters: an invisible control character in source
 *  is unreviewable, and a file carrying one stops being text to `grep`. */
// Built from code points rather than written as escapes or as the characters
// themselves: an escape sequence is fragile to tooling that rewrites it, and
// the literal characters are INVISIBLE — a file carrying them stops being
// text to `grep` and unreviewable in a diff. This source line is pure ASCII.
const FSI = String.fromCharCode(0x2068); // FIRST STRONG ISOLATE
const PDI = String.fromCharCode(0x2069); // POP DIRECTIONAL ISOLATE

/** `10` §2's «bidi-isolate every interpolated value», in the one medium that
 *  has no `<bdi>`. An empty value is left empty — isolating nothing produces
 *  two invisible characters a text part does not need. */
export function isolate(value: string): string {
  return value === "" ? "" : `${FSI}${value}${PDI}`;
}

/** `interpolate()`'s grammar, with every substituted value isolated. */
export function interpolateIsolated(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => isolate(formatValue(lookup(payload, path))));
}

export interface CompilePalette {
  fgBody: string;
  fgMuted: string;
  fgHeading: string;
  surface: string;
  edge: string;
  accent: string;
}

export interface CompileContext {
  /** The payload `renderEmail()` assembled — instants already formatted in the
   *  org's zone, `changes` and `day` already built. */
  payload: Record<string, unknown>;
  palette: CompilePalette;
  /** `0126`: a row from `org_public_logo()` and a set `APP_URL`, else null —
   *  and null renders the org's NAME as a heading, so every design is correct
   *  with no image (contract 9). */
  logoUrl: string | null;
  /** `REQ-NTF-005`. The composed footer carries it, always. */
  preferencesUrl: string | null;
  org: string;
}

export interface CompiledBlocks {
  /** Complete `<tr>` strings, in order, ready for the shell. */
  rows: string[];
  /** The paragraphs of the plain-text alternative, in the same order. */
  text: string[];
}

const SPACER_PX: Record<string, number> = { sm: 8, md: 16, lg: 32 };

/** D3a item 2: `dir="rtl"` on every text-bearing cell AND `align="right"`
 *  beside `text-align`, because Outlook's Word engine reads the attribute and
 *  does not inherit direction reliably through nested tables. A right-aligned
 *  cell is not an RTL cell. */
function cell(style: string): string {
  return `dir="rtl" align="right" style="font-family:${DESIGN_STACK};${style}"`;
}

function row(inner: string): string {
  return `      <tr>${inner}</tr>`;
}

function textCell(style: string, html: string): string {
  return row(`<td ${cell(style)}>${html}</td>`);
}

export function compileBlocks(document: unknown, ctx: CompileContext): CompiledBlocks {
  const rows: string[] = [];
  const text: string[] = [];
  const say = (template: string) => interpolateIsolated(template, ctx.payload);

  for (const block of readBlocks(document)) {
    compileOne(block, ctx, say, rows, text);
  }

  // ★ THE FOOTER IS COMPOSED, NOT TYPED (REQ-NTF-009). It is appended here,
  // to every document, always — so REQ-NTF-005's preference link cannot be
  // deleted by an admin or forgotten by a design.
  rows.push(row(`<td ${cell(`padding:8px 0 0 0;`)}><hr style="border:none;border-top:1px solid ${ctx.palette.edge};margin:0;" /></td>`));
  if (ctx.preferencesUrl) {
    rows.push(
      textCell(
        `font-size:13px;line-height:1.7;color:${ctx.palette.fgMuted};padding:12px 0 0 0;text-align:right;`,
        `<a href="${escapeHtml(ctx.preferencesUrl)}" style="color:${ctx.palette.fgMuted};">تفضيلات الإشعارات</a>`,
      ),
    );
    text.push(`تفضيلات الإشعارات: ${isolate(ctx.preferencesUrl)}`);
  }

  return { rows, text };
}

function compileOne(
  block: EmailBlock,
  ctx: CompileContext,
  say: (template: string) => string,
  rows: string[],
  text: string[],
): void {
  switch (block.type) {
    case "heading": {
      const value = say(block.text);
      if (value === "") return;
      // line-height 1.4 on headings (10 §2); never letter-spaced, never
      // `overflow: hidden` — it clips tashkeel.
      const size = block.level === 1 ? 24 : 19;
      rows.push(
        textCell(
          `font-size:${size}px;line-height:1.4;font-weight:bold;color:${ctx.palette.fgHeading};padding:0 0 12px 0;text-align:right;`,
          escapeHtml(value),
        ),
      );
      text.push(value);
      return;
    }

    case "paragraph": {
      const value = say(block.text);
      if (value === "") return;
      rows.push(
        textCell(
          `font-size:17px;line-height:1.7;color:${ctx.palette.fgBody};padding:0 0 16px 0;text-align:right;`,
          escapeHtml(value).replace(/\n/g, "<br />"),
        ),
      );
      text.push(value);
      return;
    }

    case "button": {
      const href = formatValue(lookup(ctx.payload, block.urlBinding));
      const label = say(block.label);
      // A button with no URL is a CHECK, not a refusal — the draft saves — but
      // a link to nowhere is not sent: it renders as nothing.
      if (href === "" || label === "") return;
      rows.push(row(`<td ${cell(`padding:4px 0 20px 0;text-align:right;`)}>${bulletproofButton(href, label, block.style, ctx.palette)}</td>`));
      // REQ-NTF-013: «a button becomes `label: url`».
      text.push(`${label}: ${isolate(href)}`);
      return;
    }

    case "session_card": {
      const title = formatValue(lookup(ctx.payload, "title"));
      const when = formatValue(lookup(ctx.payload, "startsAt"));
      const venue = formatValue(lookup(ctx.payload, "venue"));
      const day = formatValue(lookup(ctx.payload, "day"));
      // ★ The image is opt-in per design, because `/api/s/{id}/og` 404s for a
      // DRAFT or CANCELLED session (contract 8) — so the «إلغاء» design asks
      // for no image and a cancellation never carries a broken one.
      const image = block.withImage === true ? imageUrl({ kind: "session_card_image" }, ctx) : null;
      const lines = [title, day, when, venue].filter((line) => line !== "");
      if (lines.length === 0 && !image) return;
      const inner = [
        image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" width="512" style="display:block;width:100%;max-width:512px;height:auto;border-radius:8px;" />` : "",
        ...lines.map((line, index) =>
          index === 0
            ? `<div dir="rtl" style="font-size:19px;line-height:1.4;font-weight:bold;color:${ctx.palette.fgHeading};padding:8px 0 4px 0;text-align:right;">${escapeHtml(isolate(line))}</div>`
            : `<div dir="rtl" style="font-size:15px;line-height:1.7;color:${ctx.palette.fgMuted};text-align:right;">${escapeHtml(isolate(line))}</div>`,
        ),
      ].join("");
      rows.push(
        row(
          `<td ${cell(`padding:0 0 16px 0;text-align:right;`)}><table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${ctx.palette.surface}" style="background:${ctx.palette.surface};border:1px solid ${ctx.palette.edge};border-radius:12px;"><tr><td ${cell(`padding:12px;text-align:right;`)} bgcolor="${ctx.palette.surface}">${inner}</td></tr></table></td>`,
        ),
      );
      // REQ-NTF-013: «a session card becomes four LINES» — one text entry
      // carrying them, not four paragraphs. `text` entries are joined with a
      // blank line, so pushing each separately would space the card's title,
      // day, time and venue apart as if they were unrelated.
      text.push(lines.map((line) => isolate(line)).join("\n"));
      return;
    }

    case "detail_list": {
      const pairs = block.items
        .map((item) => ({ label: say(item.label), value: say(item.value) }))
        .filter((pair) => pair.label !== "" || pair.value !== "");
      if (pairs.length === 0) return;
      const inner = pairs
        .map(
          (pair) =>
            `<tr><td ${cell(`font-size:15px;line-height:1.7;color:${ctx.palette.fgMuted};padding:0 0 4px 0;text-align:right;`)} width="35%">${escapeHtml(pair.label)}</td>` +
            `<td ${cell(`font-size:15px;line-height:1.7;color:${ctx.palette.fgBody};padding:0 0 4px 8px;text-align:right;`)}>${escapeHtml(pair.value)}</td></tr>`,
        )
        .join("");
      rows.push(row(`<td ${cell(`padding:0 0 16px 0;`)}><table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0">${inner}</table></td>`));
      // A list is a list: consecutive lines, one entry — the same reason as
      // the session card's.
      text.push(pairs.map((pair) => `${pair.label}: ${pair.value}`).join("\n"));
      return;
    }

    case "divider": {
      rows.push(row(`<td ${cell(`padding:4px 0 20px 0;`)}><hr style="border:none;border-top:1px solid ${ctx.palette.edge};margin:0;" /></td>`));
      return;
    }

    case "spacer": {
      const height = SPACER_PX[block.height] ?? SPACER_PX.md;
      rows.push(row(`<td ${cell(`font-size:0;line-height:0;padding:0;`)} height="${height}">&nbsp;</td>`));
      return;
    }

    case "image": {
      const src = imageUrl(block.src, ctx);
      // ★ No URL — a WebP logo, an org with none, a cancelled session — is not
      // a broken image: the row is dropped, and a design whose only image was
      // the logo falls back to the org's NAME through its heading block
      // (contract 9).
      if (!src) return;
      const width = Math.min(Math.max(Math.trunc(block.width) || 160, 16), 512);
      // ★ F2 — an explicit `bgcolor` ATTRIBUTE, never a CSS background. A brand
      // logo is very often dark ink on TRANSPARENCY, and Gmail on Android
      // darkens the card's surface whatever the mail declares (F1's opt-out
      // does not reach it). A transparent PNG then has nothing to stand on and
      // the header of a designed mail goes blank.
      //
      // ★ AND IT IS A LEVER, NOT A FIX — `designer` corrected its own finding
      // on this and the correction matters more than the fix. The attribute is
      // what Outlook's Word engine reads, and it beats a CSS `background`,
      // which an inverter overrides first. But a client that inverts wholesale
      // inverts the attribute too, and **Gmail does not invert images** — so
      // dark ink on a now-dark ground is invisible whatever value is written
      // here. This improves the odds where explicit attributes are honoured and
      // does nothing where they are not. The pair surviving inversion is a
      // thing to LOOK at, not to assert (item 4, the preview's dark toggle).
      //
      // The value is the LIGHT palette's `surface`, which is a light colour by
      // construction — it is the ground the app's own dark body text sits on —
      // so it never introduces the white patch a literal `#ffffff` would put on
      // a tinted card, and it is never worse in the failure case.
      rows.push(
        row(
          `<td ${cell(`padding:0 0 16px 0;text-align:right;`)} bgcolor="${ctx.palette.surface}"><img src="${escapeHtml(src)}" alt="${escapeHtml(say(block.alt))}" width="${width}" style="display:block;width:${width}px;max-width:100%;height:auto;border:0;" /></td>`,
        ),
      );
      return;
    }
  }
}

function imageUrl(src: ImageSource, ctx: CompileContext): string | null {
  if (src.kind === "org_logo") return ctx.logoUrl;
  const sessionUrl = formatValue(lookup(ctx.payload, "session_card_image_url"));
  return sessionUrl === "" ? null : sessionUrl;
}

/**
 * A bulletproof button: a VML rounded rectangle for Outlook's Word engine
 * behind a conditional comment, and an anchor everywhere else. This is the one
 * place a mail needs something the web does not — a styled `<a>` renders as
 * plain underlined text in Outlook, which turns a primary action into a link
 * nobody sees.
 */
function bulletproofButton(href: string, label: string, style: "primary" | "secondary", palette: CompilePalette): string {
  const background = style === "primary" ? palette.accent : palette.surface;
  const colour = style === "primary" ? "#ffffff" : palette.fgHeading;
  const border = style === "primary" ? background : palette.edge;
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return [
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="18%" strokecolor="${border}" fillcolor="${background}"><w:anchorlock/><center style="color:${colour};font-family:${DESIGN_STACK};font-size:16px;">${safeLabel}</center></v:roundrect><![endif]-->`,
    `<!--[if !mso]><!-- --><a href="${safeHref}" style="display:inline-block;background:${background};color:${colour};border:1px solid ${border};border-radius:8px;font-family:${DESIGN_STACK};font-size:16px;line-height:44px;padding:0 24px;text-decoration:none;">${safeLabel}</a><!--<![endif]-->`,
  ].join("");
}
