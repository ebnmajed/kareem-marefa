// The block model — REQ-NTF-009, 16 §11.3, DEC-081, DEC-161.
//
// A template is an ordered list of typed blocks, each compiling to ONE table
// row of the shell `render.ts` builds. Since `DEC-081` retired the string path
// in M13 it is the only way to fill it: an admin's string template is framed
// as paragraphs, and a key with no row is its platform design.
//
// ★ EIGHT TYPED MEMBERS, NINE BLOCKS. `16` §11.3 lists nine and the ninth —
// `footer` — is **composed, not typed**: the compiler appends it to every
// document, always. It is not in this union, it has no id, it cannot be
// reordered and it cannot be deleted, which is the only shape in which
// REQ-NTF-005's «the preference link can never be forgotten» is TRUE rather
// than merely intended.
//
// ★ NO `subject` HERE. The subject is `notification_templates.subject` and
// nowhere else (DEC-161): one row, one source.

/** Bumped only when a stored document needs migrating. `0125` requires the
 *  key to be present, so a document with no version is refused by the
 *  database. */
export const SCHEMA_VERSION = 1;

/** Stable within a document: React keeps the row's DOM and its focus across a
 *  reorder (`ui/reorderable-list`), and the checks panel selects by it. */
export type BlockId = string;

/** What an `image` may point at — and it is a CLOSED set, deliberately.
 *
 *  A mail client fetches with no session, so an admin pasting a URL would be a
 *  tracking pixel, a mixed-content warning and a dead image waiting to happen.
 *  Contract 8: `designer` publishes exactly one asset that works there, and
 *  `0126` opened exactly one more.
 *
 *  · `org_logo`          → `/api/brand/{orgId}/logo`, PNG or JPEG, for an
 *                          ACTIVE org (`0126`). ★ A WebP logo resolves to
 *                          NOTHING on purpose — Outlook's Word engine draws no
 *                          WebP — and the design then renders the org's NAME.
 *  · `session_card_image` → `/api/s/{sessionId}/og`, the 1200 × 630 card of a
 *                          session's poster (`0080`). ★ It 404s for a DRAFT or
 *                          CANCELLED session, which is why the «إلغاء» design
 *                          carries no image at all. */
export type ImageSource = { kind: "org_logo" } | { kind: "session_card_image" };

export type EmailBlock =
  | { type: "heading"; id: BlockId; text: string; level: 1 | 2; style?: BlockStyle }
  | { type: "paragraph"; id: BlockId; text: string; style?: BlockStyle }
  /** `urlBinding` is a binding NAME — `"url"` — not a `{{placeholder}}`. An
   *  EMPTY one is a checks-panel matter (16 §11.4) and not a refusal: a draft
   *  whose link is not chosen yet must still save. */
  | { type: "button"; id: BlockId; label: string; urlBinding: string; style: "primary" | "secondary";
      /** The block's own overrides — named `blockStyle` because `style` was
       *  already the button's primary/secondary when wave 10 shipped it. */
      blockStyle?: BlockStyle }
  /** The one composite block, because most messages are about a session. */
  | { type: "session_card"; id: BlockId; withImage?: boolean; style?: BlockStyle }
  | { type: "detail_list"; id: BlockId; items: { label: string; value: string }[]; style?: BlockStyle }
  | { type: "divider"; id: BlockId; style?: BlockStyle }
  | { type: "spacer"; id: BlockId; height: "sm" | "md" | "lg" }
  /** PNG and JPEG only, never SVG (invariant 11 — clients strip it and Outlook
   *  draws nothing), width-capped, and `alt` is MANDATORY in the type because
   *  a mandatory field is mandatory in the type. */
  | { type: "image"; id: BlockId; src: ImageSource; alt: string; width: number; style?: BlockStyle }
  // ── wave 23, `REQ-NTF-015` — five more types, ADDITIVE (`DEC-235` §3.2) ──
  //
  // ★ EVERY FIELD AN AUTHOR TYPES IS CALLED `text`, `label`, `alt` OR
  // `items[].label/value`. Those are the names `public.bindings_in_blocks()`
  // (`0133`) already reads, so the database refuses an undeclared binding in a
  // new block exactly as it does in an old one — with no function changed.
  //
  // ★ NONE EMITS SVG (invariant 11). The two that draw a picture point at a
  // PNG/JPEG route we serve: the poster's card and the QR route.
  /** «الملصق» — the session's poster card, `/api/s/{id}/og` (1200 × 630). The
   *  4:5 master is not public (`POL-storage.exports.public_card` admits the
   *  card alone), so the card is what a mail can carry. */
  | { type: "poster"; id: BlockId; alt: string; style?: BlockStyle }
  /** «رمز QR» — a PNG of a URL on OUR origin, from `/api/mail/qr`. `urlBinding`
   *  is a binding NAME, as a button's is. */
  | { type: "qr"; id: BlockId; label: string; urlBinding: string; alt: string; size: "sm" | "md"; style?: BlockStyle }
  /** «الشعار» — the org's PNG/JPEG logo (`0126`), or its NAME when it has none. */
  | { type: "logo"; id: BlockId; width: number; style?: BlockStyle }
  /** «شهادة» — the certificate a message is about: its kind, session, serial,
   *  and a button to it. Implicit bindings, as `session_card`'s are. */
  | { type: "certificate"; id: BlockId; label: string; style?: BlockStyle }
  /** «اجتماعي» — links an admin types, as text. No icons: an icon is an image,
   *  and we host no PNG set (and SVG is forbidden). */
  | { type: "social"; id: BlockId; items: { label: string; value: string }[]; style?: BlockStyle };

export type BlockType = EmailBlock["type"];

/** A brand-kit token by NAME — never a hex. Resolved through the renderer's
 *  palette, so every value still passes the anchored-hex assertion and a brand
 *  change restyles the message (`REQ-NTF-014`). */
export type PaletteToken = "fgBody" | "fgHeading" | "fgMuted" | "edge" | "surface";
export const PALETTE_TOKENS: readonly PaletteToken[] = ["fgBody", "fgHeading", "fgMuted", "edge", "surface"];

/** A block's own overrides (النمط). Absent — every document written before
 *  wave 23 — compiles to exactly what it compiled before. */
export interface BlockStyle {
  /** Logical: `start` is the right edge of an RTL mail. */
  align?: "start" | "center" | "end";
  padTop?: 0 | 8 | 16 | 24;
  padBottom?: 0 | 8 | 16 | 24;
  colour?: PaletteToken;
  background?: PaletteToken;
  /** A button's corners. */
  shape?: "rounded" | "pill";
}

/** The five types wave 23 adds (`REQ-NTF-015`). `BLOCK_TYPES` stays the eight
 *  the wave-10 editor offers until that editor is rebuilt. */
export const NEW_BLOCK_TYPES: readonly BlockType[] = ["poster", "qr", "logo", "certificate", "social"];
export const ALL_BLOCK_TYPES: readonly BlockType[] = [
  "heading",
  "paragraph",
  "button",
  "session_card",
  "detail_list",
  "divider",
  "spacer",
  "image",
  ...NEW_BLOCK_TYPES,
];

export const BLOCK_TYPES: readonly BlockType[] = [
  "heading",
  "paragraph",
  "button",
  "session_card",
  "detail_list",
  "divider",
  "spacer",
  "image",
];

export interface EmailBlockDocument {
  schemaVersion: number;
  /** EVERY block, flat, in reading order — row by row, each row's columns from
   *  the start. ★ Flat on purpose: `bindings_in_blocks()` walks only this
   *  array, so a block nested inside a row would escape the database's binding
   *  check. Rows are an overlay that NAMES blocks; they never hold them. */
  blocks: EmailBlock[];
  /** Wave 23 (`REQ-NTF-015`), optional. Absent: each block is its own
   *  one-column row — every document written before, compiled as before. */
  rows?: EmailRow[];
  /** Wave 23, optional. Absent: the compiler's constants, exactly as before. */
  styles?: EmailStyles;
}

/** Column weights from the start: 1 · 1+1 · 1+2 · 1+1+1. */
export type RowLayout = "1" | "1/1" | "1/2" | "1/1/1";
export const ROW_LAYOUTS: Readonly<Record<RowLayout, readonly number[]>> = {
  "1": [1],
  "1/1": [1, 1],
  "1/2": [1, 2],
  "1/1/1": [1, 1, 1],
};

/** A row names its blocks by id, per column. A `"1"` row names exactly one. */
export interface EmailRow {
  id: string;
  layout: RowLayout;
  columns: BlockId[][];
}

/** The email's defaults (الأنماط). Closed scales and token names only: no
 *  author text, no hex, no size below the body's — so nothing here can carry
 *  a binding, and `textSizeFixed` stays true by construction. */
export interface EmailStyles {
  headingSize?: { h1?: 22 | 24 | 28; h2?: 17 | 19 | 21 };
  textColour?: PaletteToken;
  linkColour?: PaletteToken;
  button?: { style?: "primary" | "secondary"; shape?: "rounded" | "pill" };
  padding?: 16 | 24 | 32;
  ground?: "neutral" | "canvas" | "surface";
  /** Absent: linked to desktop (the default). */
  mobile?: { headingSize?: { h1?: 22 | 24 | 28; h2?: 17 | 19 | 21 }; padding?: 16 | 24 | 32 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a value from `notification_templates.blocks` is a document this
 * compiler can render.
 *
 * ★ DELIBERATELY TOLERANT OF AN UNKNOWN BLOCK TYPE, and the reason is the
 * merge → Railway window turned around: a worker running an OLDER build must
 * not throw on a document written by a NEWER one. An unrecognised block is
 * skipped by the compiler, never fatal — the mail arrives missing a row rather
 * than not arriving at all. `0134`'s check constraint is the structural
 * authority for the ENVELOPE; this is the reader's guard for the contents.
 */
export function isBlockDocument(value: unknown): value is EmailBlockDocument {
  return isRecord(value) && typeof value.schemaVersion === "number" && Array.isArray(value.blocks);
}

const str = (value: unknown): value is string => typeof value === "string";
const SPACER_HEIGHTS = new Set(["sm", "md", "lg"]);
const BUTTON_STYLES = new Set(["primary", "secondary"]);
const IMAGE_KINDS = new Set(["org_logo", "session_card_image"]);
const QR_SIZES = new Set(["sm", "md"]);
const isItems = (value: unknown): boolean =>
  Array.isArray(value) && value.every((item) => isRecord(item) && str(item.label) && str(item.value));

/**
 * ★ A RECOGNISED BLOCK WITH A MISSING FIELD IS DROPPED, NOT FATAL.
 *
 * `readBlocks()` used to validate only `type`, which made the tolerance above a
 * half-promise: an unknown TYPE was skipped, but a known type missing its
 * `text` reached the compiler and threw on `undefined.replace` — so
 * `renderEmail()` raised, `send_notification` failed, and **the mail never
 * arrived**, which is the opposite of what the comment promises. `0134` admits
 * every one of those documents, because it checks the envelope and not the
 * contents, so this function is the only validator there is.
 *
 * It matters most in the window the tolerance was written for: a future
 * `schemaVersion: 2` that renames a field would otherwise make every OLD worker
 * throw on every mail of that template. Dropping the row degrades; throwing
 * does not.
 *
 * Every check is a shape check, and `height`/`style`/`kind` are enum checks —
 * which also closes the prototype lookup (`SPACER_PX["constructor"]` returned
 * `Object`, and `??` does not catch a truthy inherited value).
 */
function isRenderable(block: Record<string, unknown>): block is EmailBlock & Record<string, unknown> {
  if (!str(block.id) || !str(block.type)) return false;
  switch (block.type) {
    case "heading":
      return str(block.text) && (block.level === 1 || block.level === 2);
    case "paragraph":
      return str(block.text);
    case "button":
      return str(block.label) && str(block.urlBinding) && str(block.style) && BUTTON_STYLES.has(block.style);
    case "session_card":
      return block.withImage === undefined || typeof block.withImage === "boolean";
    case "detail_list":
      return isItems(block.items);
    case "divider":
      return true;
    case "spacer":
      return str(block.height) && SPACER_HEIGHTS.has(block.height);
    case "image":
      return (
        isRecord(block.src) && str(block.src.kind) && IMAGE_KINDS.has(block.src.kind) &&
        str(block.alt) && typeof block.width === "number" && Number.isFinite(block.width)
      );
    // Wave 23. A `style` is never a reason to drop a block: the compiler reads
    // each of its values through an enum check and ignores what fails one.
    case "poster":
      return str(block.alt);
    case "qr":
      return str(block.label) && str(block.urlBinding) && str(block.alt) && str(block.size) && QR_SIZES.has(block.size);
    case "logo":
      return typeof block.width === "number" && Number.isFinite(block.width);
    case "certificate":
      return str(block.label);
    case "social":
      return isItems(block.items);
    default:
      // An unrecognised type: a NEWER build wrote it, and this one skips it.
      return false;
  }
}

/** One block a reader refused, so the editor's checks panel can NAME it — an
 *  admin must not approve a mail that silently lost a row. */
export interface DroppedBlock {
  /** The `id` when the block had one; the empty string when it did not. */
  id: string;
  /** The `type` when it was a string, else `"unknown"`. */
  type: string;
  reason: "unknown_type" | "malformed";
}

/** The blocks of a document, with anything unrenderable dropped. */
export function readBlocks(value: unknown): EmailBlock[] {
  return readDocument(value).blocks;
}

/** `readBlocks()`, and what it refused. */
export function readDocument(value: unknown): { blocks: EmailBlock[]; dropped: DroppedBlock[] } {
  if (!isBlockDocument(value)) return { blocks: [], dropped: [] };
  const blocks: EmailBlock[] = [];
  const dropped: DroppedBlock[] = [];
  for (const raw of value.blocks) {
    if (!isRecord(raw)) {
      dropped.push({ id: "", type: "unknown", reason: "unknown_type" });
      continue;
    }
    if (isRenderable(raw)) {
      blocks.push(raw as EmailBlock);
      continue;
    }
    const type = str(raw.type) ? raw.type : "unknown";
    dropped.push({
      id: str(raw.id) ? raw.id : "",
      type,
      reason: (ALL_BLOCK_TYPES as readonly string[]).includes(type) ? "malformed" : "unknown_type",
    });
  }
  return { blocks, dropped };
}
