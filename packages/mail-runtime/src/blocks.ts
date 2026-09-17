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
 * than not arriving at all. `0125`'s check constraint is the structural
 * authority; this is the reader's guard.
 */
export function isBlockDocument(value: unknown): value is EmailBlockDocument {
  return isRecord(value) && typeof value.schemaVersion === "number" && Array.isArray(value.blocks);
}

/** The blocks of a document, with anything unrecognisable dropped. */
export function readBlocks(value: unknown): EmailBlock[] {
  if (!isBlockDocument(value)) return [];
  return value.blocks.filter(
    (block): block is EmailBlock => isRecord(block) && typeof block.type === "string" && (BLOCK_TYPES as readonly string[]).includes(block.type),
  );
}
