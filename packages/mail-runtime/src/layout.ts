// Rows and global styles — the overlay on the flat block list (wave 23,
// `REQ-NTF-015`, `DEC-235` §3.2).
//
// ★ ADDITIVE OR IT IS WRONG. A document with neither `rows` nor `styles` —
// every document written before wave 23, and every platform design — is read
// here as `null, null`, and the compiler then takes the loop it has always
// taken. `tests/unit/mail-pinned/`'s 120 files are the proof, untouched.
//
// ★ THE SAME TOLERANCE AS `readDocument()`: nothing here throws. A row naming a
// block that does not exist forgets the name; a block no row names becomes its
// own one-column row at the end, so a malformed overlay can never lose a block
// from a mail; a value outside its scale falls back to the default.

import { PALETTE_TOKENS, ROW_LAYOUTS, type EmailBlock, type EmailStyles, type PaletteToken, type RowLayout } from "./blocks.js";

/** One row as the compiler walks it. */
export type LayoutRow =
  | { kind: "single"; block: EmailBlock }
  | { kind: "columns"; id: string; layout: RowLayout; columns: EmailBlock[][] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The rows of a document, or null when it has none — and null is the old,
 * byte-identical path.
 */
export function readRows(document: unknown, blocks: readonly EmailBlock[]): LayoutRow[] | null {
  if (!isRecord(document) || !Array.isArray(document.rows)) return null;

  const byId = new Map(blocks.map((block) => [block.id, block]));
  const used = new Set<string>();
  const take = (id: unknown): EmailBlock | null => {
    if (typeof id !== "string" || used.has(id)) return null;
    const block = byId.get(id);
    if (!block) return null;
    used.add(id);
    return block;
  };

  const rows: LayoutRow[] = [];
  for (const raw of document.rows) {
    if (!isRecord(raw) || !Array.isArray(raw.columns)) continue;
    const layout = typeof raw.layout === "string" && raw.layout in ROW_LAYOUTS ? (raw.layout as RowLayout) : null;
    const weights = layout ? ROW_LAYOUTS[layout] : null;
    const columns = raw.columns.map((column) => (Array.isArray(column) ? column : []));

    if (!layout || !weights || layout === "1" || columns.length !== weights.length) {
      // A one-column row holds one block; anything else that cannot be laid
      // out as written is read as one-column rows in the order it names them.
      for (const id of columns.flat()) {
        const block = take(id);
        if (block) rows.push({ kind: "single", block });
      }
      continue;
    }

    const resolved = columns.map((column) => column.map(take).filter((block): block is EmailBlock => block !== null));
    if (resolved.every((column) => column.length === 0)) continue;
    rows.push({ kind: "columns", id: typeof raw.id === "string" ? raw.id : "", layout, columns: resolved });
  }

  // Never lost: a block no row named is appended as its own row.
  for (const block of blocks) if (!used.has(block.id)) rows.push({ kind: "single", block });
  return rows;
}

const H1 = new Set([22, 24, 28]);
const H2 = new Set([17, 19, 21]);
const PADDING = new Set([16, 24, 32]);
const GROUND = new Set(["neutral", "canvas", "surface"]);
const BUTTON_STYLE = new Set(["primary", "secondary"]);
const SHAPE = new Set(["rounded", "pill"]);

export function isToken(value: unknown): value is PaletteToken {
  return typeof value === "string" && (PALETTE_TOKENS as readonly string[]).includes(value);
}

function headingSizes(raw: unknown): EmailStyles["headingSize"] | undefined {
  if (!isRecord(raw)) return undefined;
  const out: NonNullable<EmailStyles["headingSize"]> = {};
  if (typeof raw.h1 === "number" && H1.has(raw.h1)) out.h1 = raw.h1 as 22 | 24 | 28;
  if (typeof raw.h2 === "number" && H2.has(raw.h2)) out.h2 = raw.h2 as 17 | 19 | 21;
  return out.h1 === undefined && out.h2 === undefined ? undefined : out;
}

/**
 * The global styles, with every value outside its scale dropped — or null when
 * the document carries none, which is the old path.
 */
export function readStyles(document: unknown): EmailStyles | null {
  if (!isRecord(document) || !isRecord(document.styles)) return null;
  const raw = document.styles;
  const out: EmailStyles = {};
  const heading = headingSizes(raw.headingSize);
  if (heading) out.headingSize = heading;
  if (isToken(raw.textColour)) out.textColour = raw.textColour;
  if (isToken(raw.linkColour)) out.linkColour = raw.linkColour;
  if (isRecord(raw.button)) {
    const button: NonNullable<EmailStyles["button"]> = {};
    if (typeof raw.button.style === "string" && BUTTON_STYLE.has(raw.button.style)) button.style = raw.button.style as "primary" | "secondary";
    if (typeof raw.button.shape === "string" && SHAPE.has(raw.button.shape)) button.shape = raw.button.shape as "rounded" | "pill";
    if (button.style || button.shape) out.button = button;
  }
  if (typeof raw.padding === "number" && PADDING.has(raw.padding)) out.padding = raw.padding as 16 | 24 | 32;
  if (typeof raw.ground === "string" && GROUND.has(raw.ground)) out.ground = raw.ground as "neutral" | "canvas" | "surface";
  if (isRecord(raw.mobile)) {
    const mobile: NonNullable<EmailStyles["mobile"]> = {};
    const mh = headingSizes(raw.mobile.headingSize);
    if (mh) mobile.headingSize = mh;
    if (typeof raw.mobile.padding === "number" && PADDING.has(raw.mobile.padding)) mobile.padding = raw.mobile.padding as 16 | 24 | 32;
    if (mobile.headingSize || mobile.padding) out.mobile = mobile;
  }
  return Object.keys(out).length === 0 ? null : out;
}

/** The mobile rules, or the empty string — and empty is the old `<head>`. */
export function mobileCss(styles: EmailStyles | null): string {
  const mobile = styles?.mobile;
  if (!mobile) return "";
  const rules: string[] = [];
  if (mobile.headingSize?.h1) rules.push(`.k-h1{font-size:${mobile.headingSize.h1}px !important;}`);
  if (mobile.headingSize?.h2) rules.push(`.k-h2{font-size:${mobile.headingSize.h2}px !important;}`);
  if (mobile.padding) rules.push(`.k-card{padding:${mobile.padding}px !important;}`);
  return rules.length === 0 ? "" : `<style>@media only screen and (max-width:620px){${rules.join("")}}</style>`;
}
