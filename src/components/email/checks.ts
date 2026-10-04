import { BLOCK_TYPES, type DroppedBlock, type EmailBlock } from "@kareem/mail-runtime";

// The editor's checks panel — `16` §11.4, REQ-NTF-009, REQ-NTF-012.
//
// Pure, and in its own module, so the rules are testable without a browser and
// the panel is only their rendering. No `"use client"`: a server page may want
// to count them too.
//
// ★ TWO SEVERITIES, AND THE DIFFERENCE IS WHETHER AN ADMIN WOULD BE WRONG.
//
//   · `blocking` — the mail an admin is looking at is NOT the mail that would
//     be sent. Approving it means approving something they have not seen.
//   · `advisory` — the mail is the mail; something about it is worth a second
//     thought.
//
// The three blocking states all have the same shape and the same cause: the
// preview quietly degraded, and a preview that degrades without saying so is
// worse than one that fails, because an admin approves it.
//
// ★ TWO OF `16` §11.4's SIX ARE STRUCTURAL, NOT RUNTIME, and are named here so
// a reader does not think they were forgotten:
//
//   · «a missing preference footer» — the footer is COMPOSED, not typed
//     (`REQ-NTF-009`): the compiler appends it to every document and there is
//     no block type to delete. It cannot be missing, so it is reported as a
//     SATISFIED check rather than watched for — an admin should be able to see
//     that it is there.
//   · «text below 14 px» — no size in a mail is author-controlled. The
//     compiler emits 24/19/17/15 px, and 13 px for the footer's small print
//     alone; `tests/unit/mail-blocks.test.ts` asserts that floor. A runtime
//     check would be reading our own constants back.

export type CheckSeverity = "blocking" | "advisory" | "satisfied";

export interface EmailCheck {
  /** The message key under `notifications.admin.emails.checks.*`. */
  id:
    | "parseFailed"
    | "droppedBlock"
    | "unknownBinding"
    | "imageNoAlt"
    | "buttonNoUrl"
    | "subjectTooLong"
    | "footerPresent"
    | "textSizeFixed"
    | BlockCheckId;
  severity: CheckSeverity;
  /** The block this names, so the panel can select it. */
  blockId?: string;
  /** One value the message interpolates — a binding, a block type, a count. */
  value?: string;
}

/** Wave 23 (`REQ-NTF-015`) — the checks the five new block types add. Kept
 *  out of the literal union above so wave 10's suite, which reads that union
 *  as `16` §11.4's list, stays the record of what §11.4 named. */
export type BlockCheckId = "qrNoUrl" | "socialUrlInvalid" | "socialEmpty" | "blockEmptyForKey";
export const BLOCK_CHECK_IDS: readonly BlockCheckId[] = ["qrNoUrl", "socialUrlInvalid", "socialEmpty", "blockEmptyForKey"];

export interface ChecksInput {
  /** False when the editor's document text did not parse as JSON. */
  parsed: boolean;
  blocks: readonly EmailBlock[];
  /** What the reader and the compiler refused (`CompiledBlocks.dropped`). */
  dropped: readonly DroppedBlock[];
  subject: string;
  /** What this message key offers, from `public.notification_bindings()`. */
  offered: readonly string[];
}

/** `08` §3.2's subjects are short; 78 is where clients begin truncating. */
export const SUBJECT_LIMIT = 78;

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Every binding a document references — the same grammar the renderer and the
 *  database both use, so the panel cannot disagree with the refusal. */
export function bindingsUsed(blocks: readonly EmailBlock[], subject: string): string[] {
  const found = new Set<string>();
  const scan = (text: string) => {
    for (const match of text.matchAll(PLACEHOLDER)) found.add(match[1]);
  };
  scan(subject);
  for (const block of blocks) {
    if (block.type === "heading" || block.type === "paragraph") scan(block.text);
    if (block.type === "button") {
      scan(block.label);
      // A button's URL is a binding NAME, not a placeholder.
      if (block.urlBinding) found.add(block.urlBinding);
    }
    if (block.type === "image") scan(block.alt);
    if (block.type === "detail_list") for (const item of block.items) [item.label, item.value].forEach(scan);
    // Wave 23 — the same fields `bindings_in_blocks()` reads.
    if (block.type === "poster") scan(block.alt);
    if (block.type === "qr") {
      scan(block.label);
      scan(block.alt);
      if (block.urlBinding) found.add(block.urlBinding);
    }
    if (block.type === "certificate") scan(block.label);
    if (block.type === "social") for (const item of block.items) [item.label, item.value].forEach(scan);
  }
  return [...found];
}

export function runChecks(input: ChecksInput): EmailCheck[] {
  const checks: EmailCheck[] = [];

  // ★ FIRST, AND ALONE IF IT FIRES. When the document did not parse, the frame
  // is showing the STRING path — a real mail, and not the one being edited. An
  // admin who approves it approves a message they never saw, which is the same
  // failure as an unstyled preview arriving by a different door (the lead's
  // note 1). Nothing below is meaningful about a document that does not exist.
  if (!input.parsed) return [{ id: "parseFailed", severity: "blocking" }];

  // A row the mail LOST. `readDocument()` drops a malformed or unrecognised
  // block and the compiler drops a button whose href we would not send; either
  // way the preview is missing something the document has.
  for (const block of input.dropped) {
    checks.push({ id: "droppedBlock", severity: "blocking", blockId: block.id || undefined, value: block.type });
  }

  // `REQ-NTF-012` — the database refuses these on save. The panel says so
  // first, at the block, rather than letting the admin meet it as a failed
  // save with no idea which word caused it.
  const offered = new Set(input.offered);
  for (const binding of bindingsUsed(input.blocks, input.subject)) {
    if (!offered.has(binding)) checks.push({ id: "unknownBinding", severity: "blocking", value: binding });
  }

  for (const block of input.blocks) {
    // `REQ-NTF-009`: «always with `alt`». An empty one passes the type and
    // ships an unlabelled image, so it is blocking rather than advisory.
    if (block.type === "image" && block.alt.trim() === "") {
      checks.push({ id: "imageNoAlt", severity: "blocking", blockId: block.id });
    }
    // A button with no binding renders as NOTHING — the draft saves, and the
    // admin loses a button without being told.
    if (block.type === "button" && block.urlBinding.trim() === "") {
      checks.push({ id: "buttonNoUrl", severity: "blocking", blockId: block.id });
    }

    // ── Wave 23 (`REQ-NTF-015`) ──────────────────────────────────────────
    if ((block.type === "poster" || block.type === "qr") && block.alt.trim() === "") {
      checks.push({ id: "imageNoAlt", severity: "blocking", blockId: block.id });
    }
    // A QR with no link renders as NOTHING, as a button does.
    if (block.type === "qr" && block.urlBinding.trim() === "") {
      checks.push({ id: "qrNoUrl", severity: "blocking", blockId: block.id });
    }
    if (block.type === "social") {
      const filled = block.items.filter((item) => item.label.trim() !== "" || item.value.trim() !== "");
      if (filled.length === 0) checks.push({ id: "socialEmpty", severity: "advisory", blockId: block.id });
      // The compiler drops a link it would not send; the admin hears it here,
      // naming the label, before the mail loses it.
      for (const item of filled) {
        if (item.label.trim() === "" || !isSendableLiteral(item.value.trim())) {
          checks.push({ id: "socialUrlInvalid", severity: "blocking", blockId: block.id, value: item.label.trim() || item.value.trim() });
        }
      }
    }
    // A block whose data this message never carries renders nothing at all:
    // worth a second thought, never a refusal.
    const needs = IMPLICIT[block.type];
    if (needs && !offered.has(needs)) {
      checks.push({ id: "blockEmptyForKey", severity: "advisory", blockId: block.id });
    }
  }

  if (input.subject.length > SUBJECT_LIMIT) {
    checks.push({ id: "subjectTooLong", severity: "advisory", value: String(input.subject.length) });
  }

  // Composed, not typed: it cannot be missing, and an admin should be able to
  // SEE that rather than infer it.
  checks.push({ id: "footerPresent", severity: "satisfied" });
  // ★ `16` §11.4's sixth check — «text below 14 px» — the same way. No block
  // carries a size: the compiler emits the shell's 17 px body and the heading
  // scale, so there is nothing an admin can author that would fail it. A check
  // that can never fire is noise, but silence about a promise the design made
  // is worse — so it is listed as satisfied rather than dropped.
  checks.push({ id: "textSizeFixed", severity: "satisfied" });
  return checks;
}

/** The binding a block's implicit data hangs on. Absent: the message never
 *  carries what the block draws. `session_card` is left out on purpose — wave
 *  10's checks did not name it and changing what an existing document reports
 *  is not this wave's. */
const IMPLICIT: Partial<Record<EmailBlock["type"], string>> = { poster: "session_id", certificate: "serial" };

/** What an admin may type into a social link: `https:` or `mailto:`, the two
 *  the compiler sends for a literal. */
function isSendableLiteral(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

/** Whether anything would be approved that was not seen. */
export function hasBlocking(checks: readonly EmailCheck[]): boolean {
  return checks.some((check) => check.severity === "blocking");
}

/** A block's name for the panel and for `ui/reorderable-list`'s ▲▼ — its type
 *  and its first words, never the type alone twelve times over. */
export function blockName(block: EmailBlock, typeLabel: (type: string) => string): string {
  const label = typeLabel(block.type);
  const words =
    block.type === "heading" || block.type === "paragraph"
      ? block.text
      : block.type === "button"
        ? block.label
        : block.type === "image"
          ? block.alt
          : block.type === "detail_list" || block.type === "social"
            ? (block.items[0]?.label ?? "")
            : block.type === "qr" || block.type === "certificate"
              ? block.label
              : block.type === "poster"
                ? block.alt
                : "";
  const trimmed = words.trim().replace(/\s+/g, " ").slice(0, 32);
  return trimmed === "" ? label : `${label}: ${trimmed}`;
}

export { BLOCK_TYPES };
