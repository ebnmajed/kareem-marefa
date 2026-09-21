// The block model — REQ-NTF-009, 16 §11.3, DEC-081, DEC-161.
//
// A template is an ordered list of typed blocks, each compiling to ONE table
// row of the shell `render.ts` already builds. The shell is correct and stays;
// this is a second way to fill it, beside the string path, which keeps
// producing the bytes `tests/unit/mail-pinned/` pins.
//
// ★ EIGHT TYPED MEMBERS, NINE BLOCKS. `16` §11.3 lists nine and the ninth —
// `footer` — is **composed, not typed**: the compiler appends it to every
// document, always. It is not in this union, it has no id, it cannot be
// reordered and it cannot be deleted, which is the only shape in which
// REQ-NTF-005's «the preference link can never be forgotten» is TRUE rather
// than merely intended.
//
// ★ NO `subject` HERE. The subject is `notification_templates.subject` and
// nowhere else (DEC-161): one row, one source, and `main`'s old worker keeps
// reading it down the string path in the merge → Railway window.

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
  | { type: "heading"; id: BlockId; text: string; level: 1 | 2 }
  | { type: "paragraph"; id: BlockId; text: string }
  /** `urlBinding` is a binding NAME — `"url"` — not a `{{placeholder}}`. An
   *  EMPTY one is a checks-panel matter (16 §11.4) and not a refusal: a draft
   *  whose link is not chosen yet must still save. */
  | { type: "button"; id: BlockId; label: string; urlBinding: string; style: "primary" | "secondary" }
  /** The one composite block, because most messages are about a session. */
  | { type: "session_card"; id: BlockId; withImage?: boolean }
  | { type: "detail_list"; id: BlockId; items: { label: string; value: string }[] }
  | { type: "divider"; id: BlockId }
  | { type: "spacer"; id: BlockId; height: "sm" | "md" | "lg" }
  /** PNG and JPEG only, never SVG (invariant 11 — clients strip it and Outlook
   *  draws nothing), width-capped, and `alt` is MANDATORY in the type because
   *  a mandatory field is mandatory in the type. */
  | { type: "image"; id: BlockId; src: ImageSource; alt: string; width: number };

export type BlockType = EmailBlock["type"];

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
  blocks: EmailBlock[];
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
      return (
        Array.isArray(block.items) &&
        block.items.every((item) => isRecord(item) && str(item.label) && str(item.value))
      );
    case "divider":
      return true;
    case "spacer":
      return str(block.height) && SPACER_HEIGHTS.has(block.height);
    case "image":
      return (
        isRecord(block.src) && str(block.src.kind) && IMAGE_KINDS.has(block.src.kind) &&
        str(block.alt) && typeof block.width === "number" && Number.isFinite(block.width)
      );
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
      reason: (BLOCK_TYPES as readonly string[]).includes(type) ? "malformed" : "unknown_type",
    });
  }
  return { blocks, dropped };
}
