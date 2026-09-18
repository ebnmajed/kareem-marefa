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
    | "footerPresent";
  severity: CheckSeverity;
  /** The block this names, so the panel can select it. */
  blockId?: string;
  /** One value the message interpolates — a binding, a block type, a count. */
  value?: string;
}

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
  }

  if (input.subject.length > SUBJECT_LIMIT) {
    checks.push({ id: "subjectTooLong", severity: "advisory", value: String(input.subject.length) });
  }

  // Composed, not typed: it cannot be missing, and an admin should be able to
  // SEE that rather than infer it.
  checks.push({ id: "footerPresent", severity: "satisfied" });
  return checks;
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
          : block.type === "detail_list"
            ? (block.items[0]?.label ?? "")
            : "";
  const trimmed = words.trim().replace(/\s+/g, " ").slice(0, 32);
  return trimmed === "" ? label : `${label}: ${trimmed}`;
}

export { BLOCK_TYPES };
