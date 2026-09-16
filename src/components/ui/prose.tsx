import type { ProseProps } from "@/components/ui";

// Long-form text — an abstract, a legal page, a description — with the
// typography rules of `10` §1 applied once instead of per screen: body
// line-height 1.7 (the `text-body` ramp), headings 1.4, a readable measure,
// paragraph rhythm, and lists that indent from the inline START.
//
// What it deliberately does not do: justify (never, in Arabic), letter-space
// (never, in Arabic), or clip a line (`overflow: hidden` cuts tashkeel).

const RHYTHM =
  "[&_p+p]:mt-4 [&_h2]:mt-8 [&_h2]:text-h3 [&_h3]:mt-6 [&_h3]:text-label [&_h3]:text-fg-heading " +
  "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:ps-5 [&_li+li]:mt-1.5 " +
  "[&_a]:text-fg-heading [&_a]:underline [&_a]:underline-offset-4";

export function Prose({ children, size = "md", className = "" }: ProseProps) {
  return <div className={`max-w-prose text-fg-body ${size === "sm" ? "text-body-sm" : "text-body"} ${RHYTHM} ${className}`}>{children}</div>;
}
