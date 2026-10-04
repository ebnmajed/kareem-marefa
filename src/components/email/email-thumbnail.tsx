import type { EmailBlock } from "@kareem/mail-runtime";

// A gallery card's thumbnail — wave 23, REQ-UIX-112, the plan's D3 (a recorded deviation from «a rendered thumbnail»,
// DEC-238 §4).
//
// ★ AN OUTLINE OF THE REAL DOCUMENT, NOT A PICTURE OF ONE. Twenty-five rendered frames per load would each need the
// brand kit and a sample; this draws, in order, one shape per block the message actually holds — a bar for a heading,
// lines for a paragraph, a band for a session card or a poster, a pill for a button, a square for a QR — so two
// messages with different designs look different, and a change to a design changes its card. `aria-hidden`: the
// card's name says what it is. No colour from data and no motion.

const MAX = 6;

export function EmailThumbnail({ blocks }: { blocks: readonly EmailBlock[] }) {
  const shown = blocks.slice(0, MAX);
  return (
    <span aria-hidden="true" data-email-thumbnail="" className="flex h-36 flex-col gap-1.5 overflow-hidden rounded-field bg-surface p-3">
      {shown.map((block) => {
        switch (block.type) {
          case "heading":
            return <span key={block.id} className={`h-2 shrink-0 rounded-pill bg-fg-heading ${block.level === 1 ? "w-1/2" : "w-1/3"}`} />;
          case "paragraph":
          case "detail_list":
          case "social":
          case "certificate":
            return <span key={block.id} className="h-1.5 w-4/5 shrink-0 rounded-pill bg-fg-muted opacity-50" />;
          case "button":
            return <span key={block.id} className="h-3.5 w-1/3 shrink-0 self-center rounded-pill bg-fg-heading" />;
          case "session_card":
          case "poster":
            return <span key={block.id} className="h-12 shrink-0 rounded-field bg-edge" />;
          case "image":
          case "logo":
            return <span key={block.id} className="h-3 w-1/4 shrink-0 rounded-sm bg-edge" />;
          case "qr":
            return <span key={block.id} className="size-6 shrink-0 rounded-sm border-2 border-fg-heading" />;
          case "divider":
            return <span key={block.id} className="h-px shrink-0 bg-edge" />;
          default:
            return <span key={block.id} className="h-2 shrink-0" />;
        }
      })}
    </span>
  );
}
