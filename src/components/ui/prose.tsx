import type { ProseProps } from "@/components/ui";

// Long-form text — an abstract, a legal page, a description — with the
// typography rules of `10` §1 applied once instead of per screen: body
// line-height 1.7 (the `text-body` ramp), headings 1.4, a readable measure,
// paragraph rhythm, and lists that indent from the inline START.
//
// What it deliberately does not do: justify (never, in Arabic), letter-space
// (never, in Arabic), or clip a line (`overflow: hidden` cuts tashkeel).
//
// ★★ WAVE 17 — «ساحة اللعب» (DEC-199 §3, §5.25, REQ-UIX-051). Body text is the body
// face inside the scope as outside it, and its colours arrive by themselves. What
// the scope adds is the display face on an `h2` inside the text, as
// `ui/section-header` sets it. ★ A link here is told from the text by its
// UNDERLINE, in the text's own colour — never by the accent: lime on the light
// ground is 1.07:1 (DEC-186 §2).

const RHYTHM =
  "[&_p+p]:mt-4 [&_h2]:mt-8 [&_h2]:text-h3 [&_h3]:mt-6 [&_h3]:text-label [&_h3]:text-fg-heading " +
  "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:ps-5 [&_li+li]:mt-1.5 " +
  "[&_a]:text-fg-heading [&_a]:underline [&_a]:underline-offset-4 " +
  "pg:[&_h2]:font-display pg:[&_h2]:font-extrabold";

export function Prose({ children, size = "md", className = "" }: ProseProps) {
  return <div className={`max-w-prose text-fg-body ${size === "sm" ? "text-body-sm" : "text-body"} ${RHYTHM} ${className}`}>{children}</div>;
}
