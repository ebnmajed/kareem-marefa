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
// It does not live in `interpolate()`, which renders the SUBJECT: the
// subject has been interpolated plainly since M3, and the 30 `.subject.txt`
// files under `tests/unit/mail-pinned/` hold it so — isolating it would be a
// separate, reviewed change.

import { DESIGN_STACK, escapeHtml, formatValue, lookup } from "./primitives.js";
import { readDocument, ROW_LAYOUTS, type BlockStyle, type DroppedBlock, type EmailBlock, type EmailStyles, type ImageSource, type PaletteToken } from "./blocks.js";
import { isToken, mobileCss, readRows, readStyles, type LayoutRow } from "./layout.js";
import { isQrPath } from "./qr-paths.js";

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
  /** The app's own origin, and the third thing a button's href may be. Null in
   *  a unit test, where only `https:` and `mailto:` are then allowed. */
  appOrigin: string | null;
  org: string;
  /** Wave 23 — the editor's canvas only: each block's row carries
   *  `data-k="<id>"` so the editor can draw its selection over the one
   *  renderer's output. ★ Off by default, so nothing sent or pinned moves. */
  annotate?: boolean;
}

export interface CompiledBlocks {
  /** Complete `<tr>` strings, in order, ready for the shell. */
  rows: string[];
  /** The paragraphs of the plain-text alternative, in the same order. */
  text: string[];
  /** What the reader refused, and what this compiler refused after it — so the
   *  editor's checks panel can NAME every row the mail lost. A mail that
   *  silently drops a block is one an admin approves believing it is whole. */
  dropped: DroppedBlock[];
  /** Wave 23 — the document's global styles, for the shell; null for every
   *  document written before, which keeps the shell's literals. */
  styles: EmailStyles | null;
  /** Wave 23 — the mobile rules for `<head>`, or "" (the old head). */
  head: string;
}

/**
 * ★ A BUTTON'S HREF IS ALLOWLISTED BY SCHEME, AFTER INTERPOLATION.
 *
 * `urlBinding` names an arbitrary payload path, and the value reaches the HTML
 * through `escapeHtml`, which has nothing whatever to say about
 * `javascript:`, `data:` or `//evil.com` — escaping quotes does not make a
 * scheme safe. It is not live today, because mail clients strip such hrefs and
 * the preview's iframe is sandboxed without `allow-scripts` — but **both of
 * those defences belong to somebody else**, and a rule that depends on a third
 * party's behaviour is not a rule.
 *
 * Applied AFTER interpolation, because the binding is what decides the value
 * and the template author never sees it. `https:` and `mailto:` always; the
 * app's own origin as well, which is what lets `http://localhost:3000` through
 * in development and nothing else.
 */
function isSendableHref(href: string, appOrigin: string | null): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    // Not absolute: a relative href in a mail resolves against the CLIENT, so
    // it is never right.
    return false;
  }
  if (url.protocol === "https:" || url.protocol === "mailto:") return true;
  if (!appOrigin) return false;
  try {
    return url.origin === new URL(appOrigin).origin;
  } catch {
    return false;
  }
}

const SPACER_PX: Record<string, number> = { sm: 8, md: 16, lg: 32 };

/**
 * ★ A LONG UNBROKEN RUN WRAPS INSTEAD OF WIDENING THE MAIL — on the cells an
 * author types into (a paragraph, a detail value).
 *
 * An admin's own text can carry a bare `{{url}}` line; a URL has no break
 * opportunity, a table cell grows to its min-content, and the whole mail then
 * scrolls sideways on a phone (the N1 review measured 488 px at 390).
 * `overflow-wrap: break-word` does NOT help here — it breaks only after the
 * cell has been sized — so the pair is:
 *   · `overflow-wrap:anywhere` — the standard property that also lowers the
 *     min-content width, which is what a table cell is sized by (Apple Mail,
 *     iOS, Outlook.com and the web engines);
 *   · `word-break:break-word` — the legacy value Gmail's sanitiser keeps and
 *     WebKit/Blink honour with the same min-content effect.
 * Outlook's Word engine ignores both and wraps inside the 560 px table as it
 * always has. Both break only where no ordinary opportunity exists, so Arabic
 * prose wraps at its spaces exactly as before. Never `overflow: hidden`.
 */
const WRAP = "overflow-wrap:anywhere;word-break:break-word;";

/** D3a item 2: `dir="rtl"` on every text-bearing cell AND `align="right"`
 *  beside `text-align`, because Outlook's Word engine reads the attribute and
 *  does not inherit direction reliably through nested tables. A right-aligned
 *  cell is not an RTL cell. */
function cell(style: string, align: Physical = "right"): string {
  return `dir="rtl" align="${align}" style="font-family:${DESIGN_STACK};${style}"`;
}

function row(inner: string): string {
  return `      <tr>${inner}</tr>`;
}

function textCell(style: string, html: string, align: Physical = "right", cls = ""): string {
  return row(`<td ${cls ? `class="${cls}" ` : ""}${cell(style, align)}>${html}</td>`);
}

// ── Wave 23: the overrides, each one a no-op when absent ─────────────────────
//
// ★ EVERY HELPER BELOW RETURNS ITS DEFAULT, CHARACTER FOR CHARACTER, WHEN THE
// BLOCK CARRIES NO STYLE — which is every block written before wave 23. That is
// the whole of «additive» for the existing types, and the pinned files are what
// hold it.

/** An RTL mail's three alignments, in the physical words HTML's `align` takes. */
type Physical = "right" | "center" | "left";

/** The compiler's working context: the caller's, plus the column's width and
 *  the document's styles. A single-column row is 512 px wide, which is what
 *  every literal below has always assumed. */
interface Ctx extends CompileContext {
  width: number;
  styles: EmailStyles | null;
}

const FULL_WIDTH = 512;
const GUTTER = 8;
const PADS = new Set([0, 8, 16, 24]);

function styleOf(block: EmailBlock): BlockStyle | undefined {
  const raw = block.type === "button" ? block.blockStyle : "style" in block ? block.style : undefined;
  return raw && typeof raw === "object" ? raw : undefined;
}

function alignOf(block: EmailBlock): Physical {
  const align = styleOf(block)?.align;
  return align === "center" ? "center" : align === "end" ? "left" : "right";
}

/** `padding:` for a block, from its default `top right bottom left`. */
function padOf(block: EmailBlock, fallback: string): string {
  const style = styleOf(block);
  const top = typeof style?.padTop === "number" && PADS.has(style.padTop) ? style.padTop : null;
  const bottom = typeof style?.padBottom === "number" && PADS.has(style.padBottom) ? style.padBottom : null;
  if (top === null && bottom === null) return fallback;
  const [t, r, b, l] = fallback.split(" ");
  return `${top === null ? t : `${top}px`} ${r} ${bottom === null ? b : `${bottom}px`} ${l}`;
}

function token(ctx: Ctx, name: PaletteToken | undefined, fallback: string): string {
  return name && isToken(name) ? ctx.palette[name] : fallback;
}

function colourOf(block: EmailBlock, ctx: Ctx, fallback: string): string {
  return token(ctx, styleOf(block)?.colour, fallback);
}

/** A cell's background as an attribute (what Outlook reads) — or nothing. */
function bgAttr(block: EmailBlock, ctx: Ctx): string {
  const name = styleOf(block)?.background;
  return name && isToken(name) ? ` bgcolor="${ctx.palette[name]}"` : "";
}

function shapeOf(block: EmailBlock, ctx: Ctx): "rounded" | "pill" {
  const own = styleOf(block)?.shape;
  if (own === "pill" || own === "rounded") return own;
  return ctx.styles?.button?.shape === "pill" ? "pill" : "rounded";
}

const KIND: Readonly<Record<string, string>> = { attendance: "شهادة حضور", presenter: "شهادة تقديم", achievement: "شهادة إنجاز" };

export function compileBlocks(document: unknown, context: CompileContext): CompiledBlocks {
  const rows: string[] = [];
  const text: string[] = [];
  const say = (template: string) => interpolateIsolated(template, context.payload);
  const { blocks, dropped } = readDocument(document);
  const styles = readStyles(document);
  const ctx: Ctx = { ...context, width: FULL_WIDTH, styles };
  const layout = readRows(document, blocks, { keepEmpty: context.annotate === true });

  if (layout === null) {
    // ★ THE PATH EVERY DOCUMENT WRITTEN BEFORE WAVE 23 TAKES, unchanged.
    for (const block of blocks) {
      compileAnnotated(block, ctx, say, rows, text, dropped);
    }
  } else {
    for (const entry of layout) compileRow(entry, ctx, say, rows, text, dropped);
  }

  // ★ THE FOOTER IS COMPOSED, NOT TYPED (REQ-NTF-009). It is appended here,
  // to every document, always — so REQ-NTF-005's preference link cannot be
  // deleted by an admin or forgotten by a design.
  rows.push(row(`<td ${cell(`padding:8px 0 0 0;`)}><hr style="border:none;border-top:1px solid ${ctx.palette.edge};margin:0;" /></td>`));
  if (ctx.preferencesUrl) {
    const link = token(ctx, styles?.linkColour, ctx.palette.fgMuted);
    rows.push(
      textCell(
        `font-size:13px;line-height:1.7;color:${ctx.palette.fgMuted};padding:12px 0 0 0;text-align:right;`,
        `<a href="${escapeHtml(ctx.preferencesUrl)}" style="color:${link};">تفضيلات الإشعارات</a>`,
      ),
    );
    text.push(`تفضيلات الإشعارات: ${isolate(ctx.preferencesUrl)}`);
  }

  return { rows, text, dropped, styles, head: mobileCss(styles) };
}

/** `compileOne()`, with the block's id on the row it wrote when the editor
 *  asked for it (`annotate`). Without `annotate` it is `compileOne()`. */
function compileAnnotated(
  block: EmailBlock,
  ctx: Ctx,
  say: (template: string) => string,
  rows: string[],
  text: string[],
  dropped: DroppedBlock[],
): void {
  const start = rows.length;
  compileOne(block, ctx, say, rows, text, dropped);
  if (!ctx.annotate) return;
  // ★ The canvas must be able to SELECT a block that renders nothing yet — a button with no link, a poster with no
  // card — or the admin could never reach it to fix it. In the editor's frame alone, such a block holds a dashed
  // placeholder the overlay names; the sent mail never carries one.
  if (rows.length === start) {
    rows.push(row(`<td ${cell(`padding:0 0 16px 0;`)}><div style="height:40px;border:1px dashed ${ctx.palette.edge};border-radius:8px;"></div></td>`));
  }
  for (let i = start; i < rows.length; i++) {
    rows[i] = rows[i]!.replace("<tr>", `<tr data-k="${escapeHtml(block.id)}">`);
  }
}

/**
 * One row of a document that carries `rows`. A one-column row compiles through
 * the same `compileOne()` into the same top-level `<tr>`, so even a mixed
 * document's single rows are byte-identical to what they would be flat.
 *
 * A multi-column row is ONE shell row holding a hybrid («spongy») row: each
 * column an `inline-block` capped at its width, which stacks on a phone with no
 * media query (Gmail's app strips some), wrapped in an Outlook ghost table so
 * the Word engine lays the columns side by side. `dir="rtl"` on every table and
 * cell (D3a item 2): the first column is the right one.
 */
function compileRow(
  entry: LayoutRow,
  ctx: Ctx,
  say: (template: string) => string,
  rows: string[],
  text: string[],
  dropped: DroppedBlock[],
): void {
  if (entry.kind === "single") {
    compileAnnotated(entry.block, ctx, say, rows, text, dropped);
    return;
  }

  const weights = ROW_LAYOUTS[entry.layout];
  const total = weights.reduce((sum, w) => sum + w, 0);
  const free = FULL_WIDTH - GUTTER * (weights.length - 1);
  const widths = weights.map((w) => Math.floor((free * w) / total));

  const columns = entry.columns.map((column, index) => {
    const width = widths[index] ?? free;
    const inner: string[] = [];
    for (const block of column) compileAnnotated(block, { ...ctx, width }, say, inner, text, dropped);
    // The canvas only: an empty column holds a dashed place, so it has a size the editor can measure and fill.
    if (ctx.annotate && column.length === 0) {
      inner.push(row(`<td ${cell(`padding:0 0 16px 0;`)}><div style="height:40px;border:1px dashed ${ctx.palette.edge};border-radius:8px;"></div></td>`));
    }
    const last = index === entry.columns.length - 1;
    // The gap sits on the LEFT of a column that is not the last: in an RTL row
    // the next column is to its left. Physical, because a mail's CSS is.
    const gap = last ? "" : `padding-left:${GUTTER}px;`;
    return {
      width,
      gap,
      html: `<div dir="rtl" style="display:inline-block;vertical-align:top;width:100%;max-width:${width + (last ? 0 : GUTTER)}px;font-size:17px;">` +
        `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td dir="rtl" align="right" style="${gap}">` +
        `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0">${inner.join("")}</table>` +
        `</td></tr></table></div>`,
    };
  });

  const ghostOpen = `<!--[if mso]><table role="presentation" dir="rtl" width="${FULL_WIDTH}" cellpadding="0" cellspacing="0" border="0"><tr><![endif]-->`;
  const ghostClose = `<!--[if mso]></tr></table><![endif]-->`;
  const body = columns
    .map((column) => `<!--[if mso]><td dir="rtl" width="${column.width + (column.gap ? GUTTER : 0)}" valign="top"><![endif]-->${column.html}<!--[if mso]></td><![endif]-->`)
    .join("");
  const tr = row(`<td ${cell(`padding:0 0 0 0;font-size:0;text-align:right;`)}>${ghostOpen}${body}${ghostClose}</td>`);
  rows.push(ctx.annotate && entry.id ? tr.replace("<tr>", `<tr data-k="${escapeHtml(entry.id)}">`) : tr);
}

function compileOne(
  block: EmailBlock,
  ctx: Ctx,
  say: (template: string) => string,
  rows: string[],
  text: string[],
  dropped: DroppedBlock[],
): void {
  switch (block.type) {
    case "heading": {
      const value = say(block.text);
      if (value === "") return;
      // line-height 1.4 on headings (10 §2); never letter-spaced, never
      // `overflow: hidden` — it clips tashkeel.
      const sizes = ctx.styles?.headingSize;
      const size = block.level === 1 ? (sizes?.h1 ?? 24) : (sizes?.h2 ?? 19);
      const mobile = ctx.styles?.mobile?.headingSize;
      const cls = block.level === 1 ? (mobile?.h1 ? "k-h1" : "") : mobile?.h2 ? "k-h2" : "";
      const align = alignOf(block);
      rows.push(
        textCell(
          `font-size:${size}px;line-height:1.4;font-weight:bold;color:${colourOf(block, ctx, ctx.palette.fgHeading)};padding:${padOf(block, "0 0 12px 0")};text-align:${align};`,
          escapeHtml(value),
          align,
          cls,
        ),
      );
      text.push(value);
      return;
    }

    case "paragraph": {
      const value = say(block.text);
      if (value === "") return;
      const align = alignOf(block);
      const body = token(ctx, ctx.styles?.textColour, ctx.palette.fgBody);
      rows.push(
        textCell(
          `font-size:17px;line-height:1.7;color:${colourOf(block, ctx, body)};padding:${padOf(block, "0 0 16px 0")};text-align:${align};${WRAP}`,
          escapeHtml(value).replace(/\n/g, "<br />"),
          align,
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
      // ★ And a link to somewhere we would not send is dropped LOUDLY, so the
      // checks panel names it rather than an admin wondering where the button
      // went.
      if (!isSendableHref(href, ctx.appOrigin)) {
        dropped.push({ id: block.id, type: "button", reason: "malformed" });
        return;
      }
      const align = alignOf(block);
      rows.push(
        row(
          `<td ${cell(`padding:${padOf(block, "4px 0 20px 0")};text-align:${align};`, align)}${bgAttr(block, ctx)}>${bulletproofButton(href, label, block.style, ctx.palette, shapeOf(block, ctx), Math.min(240, ctx.width))}</td>`,
        ),
      );
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
        image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" width="${ctx.width}" style="display:block;width:100%;max-width:${ctx.width}px;height:auto;border-radius:8px;" />` : "",
        ...lines.map((line, index) =>
          index === 0
            ? `<div dir="rtl" style="font-size:19px;line-height:1.4;font-weight:bold;color:${ctx.palette.fgHeading};padding:8px 0 4px 0;text-align:right;">${escapeHtml(isolate(line))}</div>`
            : `<div dir="rtl" style="font-size:15px;line-height:1.7;color:${ctx.palette.fgMuted};text-align:right;">${escapeHtml(isolate(line))}</div>`,
        ),
      ].join("");
      rows.push(
        row(
          `<td ${cell(`padding:${padOf(block, "0 0 16px 0")};text-align:right;`)}><table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${ctx.palette.surface}" style="background:${ctx.palette.surface};border:1px solid ${ctx.palette.edge};border-radius:12px;"><tr><td ${cell(`padding:12px;text-align:right;`)} bgcolor="${ctx.palette.surface}">${inner}</td></tr></table></td>`,
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
        // ★ A row whose VALUE is empty is dropped, whatever its label: «رقم
        // الشهادة:» over nothing is a question the mail asks and cannot answer.
        // The retirement found it — `MSG-export_ready` shares the certificate
        // family's serial row and has no serial — the first time the design
        // was rendered for an org that had not adopted it.
        .filter((pair) => pair.value.trim() !== "");
      if (pairs.length === 0) return;
      const inner = pairs
        .map(
          (pair) =>
            `<tr><td ${cell(`font-size:15px;line-height:1.7;color:${ctx.palette.fgMuted};padding:0 0 4px 0;text-align:right;`)} width="35%">${escapeHtml(pair.label)}</td>` +
            `<td ${cell(`font-size:15px;line-height:1.7;color:${token(ctx, ctx.styles?.textColour, ctx.palette.fgBody)};padding:0 0 4px 8px;text-align:right;${WRAP}`)}>${escapeHtml(pair.value)}</td></tr>`,
        )
        .join("");
      rows.push(row(`<td ${cell(`padding:${padOf(block, "0 0 16px 0")};`)}><table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0">${inner}</table></td>`));
      // A list is a list: consecutive lines, one entry — the same reason as
      // the session card's.
      text.push(pairs.map((pair) => `${pair.label}: ${pair.value}`).join("\n"));
      return;
    }

    case "divider": {
      rows.push(row(`<td ${cell(`padding:${padOf(block, "4px 0 20px 0")};`)}><hr style="border:none;border-top:1px solid ${ctx.palette.edge};margin:0;" /></td>`));
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
      const width = Math.min(Math.max(Math.trunc(block.width) || 160, 16), ctx.width);
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
          `<td ${cell(`padding:${padOf(block, "0 0 16px 0")};text-align:${alignOf(block)};`, alignOf(block))} bgcolor="${ctx.palette.surface}"><img src="${escapeHtml(src)}" alt="${escapeHtml(say(block.alt))}" width="${width}" style="${imageStyle(block, width)}" /></td>`,
        ),
      );
      return;
    }

    // ── Wave 23 (`REQ-NTF-015`) ───────────────────────────────────────────

    case "poster": {
      // The session's poster CARD (`/api/s/{id}/og`), which the worker hands
      // over only when it exists — so a draft, a cancelled session or one with
      // no poster drops the row and never shows a broken image.
      const src = imageUrl({ kind: "session_card_image" }, ctx);
      if (!src) return;
      const align = alignOf(block);
      rows.push(
        row(
          `<td ${cell(`padding:${padOf(block, "0 0 16px 0")};text-align:${align};`, align)} bgcolor="${ctx.palette.surface}"><img src="${escapeHtml(src)}" alt="${escapeHtml(say(block.alt))}" width="${ctx.width}" style="display:block;width:100%;max-width:${ctx.width}px;height:auto;border:0;border-radius:8px;" /></td>`,
        ),
      );
      // No text line, as `image` writes none: the text part must not depend on
      // whether a picture happened to exist.
      return;
    }

    case "qr": {
      const href = formatValue(lookup(ctx.payload, block.urlBinding));
      if (href === "") return;
      const path = qrPath(href, ctx.appOrigin);
      // ★ A QR is drawn only for a page on OUR origin that `/api/mail/qr`
      // agrees to draw. Anything else is dropped LOUDLY, so the checks panel
      // names it rather than an admin wondering where the code went.
      if (path === null || !ctx.appOrigin) {
        dropped.push({ id: block.id, type: "qr", reason: "malformed" });
        return;
      }
      const side = block.size === "sm" ? 120 : 160;
      const src = `${ctx.appOrigin.replace(/\/+$/, "")}/api/mail/qr?p=${encodeURIComponent(path)}`;
      const label = say(block.label);
      const align = alignOf(block);
      const caption = label === "" ? "" : `<div dir="rtl" style="font-size:15px;line-height:1.7;color:${ctx.palette.fgMuted};padding:8px 0 0 0;text-align:${align};">${escapeHtml(label)}</div>`;
      const imgAlign = align === "center" ? "margin:0 auto;" : align === "left" ? "margin:0 auto 0 0;" : "margin:0 0 0 auto;";
      rows.push(
        row(
          `<td ${cell(`padding:${padOf(block, "0 0 16px 0")};text-align:${align};`, align)} bgcolor="${ctx.palette.surface}"><img src="${escapeHtml(src)}" alt="${escapeHtml(say(block.alt))}" width="${side}" height="${side}" style="display:block;width:${side}px;height:${side}px;border:0;${imgAlign}" />${caption}</td>`,
        ),
      );
      // REQ-NTF-013: the same line a button writes, so a stripped client can
      // still follow it.
      text.push(label === "" ? isolate(href) : `${label}: ${isolate(href)}`);
      return;
    }

    case "logo": {
      const align = alignOf(block);
      if (ctx.logoUrl) {
        const width = Math.min(Math.max(Math.trunc(block.width) || 160, 16), ctx.width);
        rows.push(
          row(
            `<td ${cell(`padding:${padOf(block, "0 0 16px 0")};text-align:${align};`, align)} bgcolor="${ctx.palette.surface}"><img src="${escapeHtml(ctx.logoUrl)}" alt="${escapeHtml(ctx.org)}" width="${width}" style="${imageStyle(block, width)}" /></td>`,
          ),
        );
      } else {
        // ★ No PNG/JPEG logo — none, or a WebP one `0126` refuses — is the
        // org's NAME, so every message is correct with no image (contract 9).
        rows.push(
          textCell(
            `font-size:19px;line-height:1.4;font-weight:bold;color:${colourOf(block, ctx, ctx.palette.fgHeading)};padding:${padOf(block, "0 0 16px 0")};text-align:${align};`,
            escapeHtml(ctx.org),
            align,
          ),
        );
      }
      // ★ No text in EITHER branch: the signature line already names the org,
      // and the pinned suite holds that the text part never depends on whether
      // a logo exists.
      return;
    }

    case "certificate": {
      const kind = KIND[formatValue(lookup(ctx.payload, "kind"))] ?? "";
      const title = formatValue(lookup(ctx.payload, "title"));
      const serial = formatValue(lookup(ctx.payload, "serial"));
      const lines = [kind, title, serial].filter((line) => line !== "");
      const href = formatValue(lookup(ctx.payload, "url"));
      const label = say(block.label);
      const linkable = href !== "" && label !== "" && isSendableHref(href, ctx.appOrigin);
      if (href !== "" && label !== "" && !linkable) dropped.push({ id: block.id, type: "certificate", reason: "malformed" });
      if (lines.length === 0) return;
      const inner =
        lines
          .map((line, index) =>
            index === 0
              ? `<div dir="rtl" style="font-size:19px;line-height:1.4;font-weight:bold;color:${ctx.palette.fgHeading};padding:0 0 4px 0;text-align:right;">${escapeHtml(isolate(line))}</div>`
              : `<div dir="rtl" style="font-size:15px;line-height:1.7;color:${ctx.palette.fgMuted};text-align:right;">${escapeHtml(isolate(line))}</div>`,
          )
          .join("") + (linkable ? `<div dir="rtl" style="padding:12px 0 0 0;text-align:right;">${bulletproofButton(href, label, "primary", ctx.palette, shapeOf(block, ctx), Math.min(240, ctx.width))}</div>` : "");
      rows.push(
        row(
          `<td ${cell(`padding:${padOf(block, "0 0 16px 0")};text-align:right;`)}><table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${ctx.palette.surface}" style="background:${ctx.palette.surface};border:1px solid ${ctx.palette.edge};border-radius:12px;"><tr><td ${cell(`padding:12px;text-align:right;`)} bgcolor="${ctx.palette.surface}">${inner}</td></tr></table></td>`,
        ),
      );
      text.push(lines.map((line) => isolate(line)).join("\n"));
      if (linkable) text.push(`${label}: ${isolate(href)}`);
      return;
    }

    case "social": {
      const links: { label: string; href: string }[] = [];
      for (const item of block.items) {
        const label = say(item.label);
        // The address is the admin's own literal, never interpolated: an
        // isolated binding inside a URL would break it.
        const href = item.value.trim();
        if (label === "" && href === "") continue;
        if (label === "" || !isSendableHref(href, ctx.appOrigin)) {
          dropped.push({ id: block.id, type: "social", reason: "malformed" });
          continue;
        }
        links.push({ label, href });
      }
      if (links.length === 0) return;
      const colour = colourOf(block, ctx, token(ctx, ctx.styles?.linkColour, ctx.palette.fgMuted));
      const align = alignOf(block);
      rows.push(
        textCell(
          `font-size:15px;line-height:1.7;color:${ctx.palette.fgMuted};padding:${padOf(block, "0 0 16px 0")};text-align:${align};`,
          links.map((link) => `<a href="${escapeHtml(link.href)}" style="color:${colour};">${escapeHtml(link.label)}</a>`).join(" · "),
          align,
        ),
      );
      text.push(links.map((link) => `${link.label}: ${isolate(link.href)}`).join("\n"));
      return;
    }
  }
}

/** An image's inline style: today's exactly, unless the block is centred or
 *  end-aligned, when the image follows (a `display:block` image ignores
 *  `text-align`). */
function imageStyle(block: EmailBlock, width: number): string {
  const align = alignOf(block);
  const margin = align === "center" ? "margin:0 auto;" : align === "left" ? "margin:0 auto 0 0;" : "";
  return `display:block;width:${width}px;max-width:100%;height:auto;border:0;${margin}`;
}

/** The path a QR may encode, or null — an absolute URL on our own origin, with
 *  no query and no fragment, that `/api/mail/qr` will draw. */
function qrPath(href: string, appOrigin: string | null): string | null {
  if (!appOrigin) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  try {
    if (url.origin !== new URL(appOrigin).origin) return null;
  } catch {
    return null;
  }
  if (url.search !== "" || url.hash !== "") return null;
  return isQrPath(url.pathname) ? url.pathname : null;
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
function bulletproofButton(
  href: string,
  label: string,
  style: "primary" | "secondary",
  palette: CompilePalette,
  shape: "rounded" | "pill" = "rounded",
  width = 240,
): string {
  const background = style === "primary" ? palette.accent : palette.surface;
  // ★ THE LABEL IS THE HEADING COLOUR ON BOTH, AND IT USED TO BE A WHITE
  // LITERAL ON THE PRIMARY (wave 24, `REQ-NTF-016`, `DEC-242` §2).
  //
  // White was safe only while `accent` WAS the heading colour — a dark fill, so
  // white on it. `accent` is now the kit's `node`, the single accent, and the
  // design's own pairing is «text on it is ink» (`01-tokens.md`). Measured on
  // the platform default's light scheme: the accent behind a white label is
  // **2.70:1** and fails SC 1.4.3; behind the heading colour it is **6.87:1**.
  // On the sample kit's gold the same pair is **1.93:1** and **7.30:1**.
  //
  // ★ So the two changes are ONE commit by necessity, not by preference: moving
  // `accent` to `node` while leaving this literal would ship a button below AA
  // for every org on the default.
  //
  // ★ And it is a TOKEN, so an org that overrode its kit gets its own pairing
  // (`DEC-242` §6). The kit guarantees no contrast pair for the accent — `0144`
  // guards the six status pairs only — so a kit whose `node` and `fgHeading` are
  // close is as unguarded as a kit whose `fgHeading` was pale under the old
  // white. The change moves that class of defect; it does not create it, and a
  // kit-level accent guard is `branding`'s and M13's.
  const colour = palette.fgHeading;
  const border = style === "primary" ? background : palette.edge;
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return [
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:44px;v-text-anchor:middle;width:${width}px;" arcsize="${shape === "pill" ? "50%" : "18%"}" strokecolor="${border}" fillcolor="${background}"><w:anchorlock/><center style="color:${colour};font-family:${DESIGN_STACK};font-size:16px;">${safeLabel}</center></v:roundrect><![endif]-->`,
    `<!--[if !mso]><!-- --><a href="${safeHref}" style="display:inline-block;background:${background};color:${colour};border:1px solid ${border};border-radius:${shape === "pill" ? "22px" : "8px"};font-family:${DESIGN_STACK};font-size:16px;line-height:44px;padding:0 24px;text-decoration:none;">${safeLabel}</a><!--<![endif]-->`,
  ].join("");
}


/**
 * The plain-text alternative a BLOCK row stores in `notification_templates.body`
 * — `REQ-NTF-013`, and contract 3's answer.
 *
 * ★ IN TEMPLATE FORM: `{{bindings}}` are left INTACT, never resolved. The row
 * is stored once and read by every send, so a rendered text would put one
 * member's name in every other member's mail. `main`'s OLD worker renders this
 * down its string path between the owner's push and the Railway redeploy, and
 * interpolates it per member exactly as it does a hand-written body.
 *
 * ★ AND WITHOUT A SIGNATURE. The string path appends «—\n{org} · SIGNATURE»
 * itself (`renderEmail()`), so carrying one here would sign the mail twice.
 * The preference footer is likewise absent: it is composed at render time, not
 * authored, and there is no binding for it to survive as.
 *
 * A line whose only content is a binding the old worker cannot supply renders
 * empty and `toParagraphs()` drops it — the same mechanism `{{tasks}}` has
 * always used.
 */
export function blocksToTemplateText(document: unknown): string {
  const lines: string[] = [];
  for (const block of readDocument(document).blocks) {
    switch (block.type) {
      case "heading":
      case "paragraph":
        if (block.text.trim() !== "") lines.push(block.text);
        break;
      case "button":
        // `label: {{binding}}` — the placeholder, not the value.
        if (block.label.trim() !== "" && block.urlBinding.trim() !== "") lines.push(`${block.label}: {{${block.urlBinding}}}`);
        break;
      case "session_card":
        lines.push(["{{title}}", "{{day}}", "{{startsAt}}", "{{venue}}"].join("\n"));
        break;
      case "detail_list": {
        const rows = block.items.filter((item) => item.label.trim() !== "" || item.value.trim() !== "");
        if (rows.length > 0) lines.push(rows.map((item) => `${item.label}: ${item.value}`).join("\n"));
        break;
      }
      case "image":
        if (block.alt.trim() !== "") lines.push(block.alt);
        break;
      case "divider":
      case "spacer":
        break;
      // Wave 23 — the same lines the compiler writes, in template form.
      case "poster":
      case "logo":
        break;
      case "qr":
        if (block.urlBinding.trim() !== "") lines.push(block.label.trim() !== "" ? `${block.label}: {{${block.urlBinding}}}` : `{{${block.urlBinding}}}`);
        break;
      case "certificate":
        lines.push(["{{title}}", "{{serial}}"].join("\n"));
        if (block.label.trim() !== "") lines.push(`${block.label}: {{url}}`);
        break;
      case "social": {
        const items = block.items.filter((item) => item.label.trim() !== "" && item.value.trim() !== "");
        if (items.length > 0) lines.push(items.map((item) => `${item.label}: ${item.value}`).join("\n"));
        break;
      }
    }
  }
  return lines.join("\n\n");
}
