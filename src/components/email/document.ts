import { SCHEMA_VERSION, type BlockType, type EmailBlock } from "@kareem/mail-runtime";

// The email document's pure helpers — moved VERBATIM out of `block-editor.tsx`
// before that chrome file is rebuilt (`DEC-237` §2: logic living in a chrome
// file moves first, in its own commit, every suite green across it). The
// wave-23 builder is written over these, so the rules they carry — a block
// always has an id, a new block starts empty, the saved string is the one both
// «what is stored» and «what is on screen» compare by — survive the rebuild.

/** The document as the save posts it — the one string both «what is stored» and «what is on screen» compare by. */
export function documentJsonOf(blocks: readonly EmailBlock[]): string {
  return blocks.length > 0 ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, blocks }) : "";
}

let counter = 0;
/** A stable id for a new block. `readDocument()` requires one, and the
 *  reorderable list keeps a row's DOM — and its focus — by it. */
export function newId(): string {
  counter += 1;
  return `b${Date.now().toString(36)}${counter}`;
}

export function emptyBlock(type: BlockType): EmailBlock {
  const id = newId();
  switch (type) {
    case "heading":
      return { type, id, text: "", level: 1 };
    case "paragraph":
      return { type, id, text: "" };
    case "button":
      return { type, id, label: "", urlBinding: "", style: "primary" };
    case "session_card":
      return { type, id };
    case "detail_list":
      return { type, id, items: [{ label: "", value: "" }] };
    case "divider":
      return { type, id };
    case "spacer":
      return { type, id, height: "md" };
    case "image":
      return { type, id, src: { kind: "org_logo" }, alt: "", width: 160 };
    // Wave 23 (`REQ-NTF-015`). Each starts as a block the checks will name
    // until it is filled — an empty alt or link is blocking, never silent.
    case "poster":
      return { type, id, alt: "ملصق الجلسة" };
    case "qr":
      return { type, id, label: "امسح للفتح", urlBinding: "url", alt: "", size: "md" };
    case "logo":
      return { type, id, width: 160 };
    case "certificate":
      return { type, id, label: "اعرض الشهادة" };
    case "social":
      return { type, id, items: [{ label: "", value: "" }] };
  }
}
