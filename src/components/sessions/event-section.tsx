import type { ReactNode } from "react";
import { SectionHeader } from "@/components/ui/section-header";
import { isSectionShown, type EventSectionId, type SlotSummary } from "@/components/sessions/slots";

// One section of the event page — rebuilt in wave 18 (REQ-UIX-061); the slot contract, `16` §5.4.1a(b),
// REQ-UIX-015, DEC-130.
//
// ★ THE PAGE OWNS THE LANDMARK, SO THE PAGE OWNS THE CONDITION. A slot that can render nothing takes its
// `<section>` and its `<h2>` with it — decided by the page's own gate and the slot's summary through
// `isSectionShown()`, the same rule the sub-nav reads, so the two never disagree. The summary is only awaited
// when the gate is open; the page wraps each section in `<Suspense>` so the hero and the card paint first.
//
// `<section id>` is the jump target and `<h2 id="{id}-heading">` names the region — the names other tracks'
// specs select on («المواد», «الصور», «النقاش») come from `title`, so no count is ever put inside the heading.
// What the artboards print at the header's end («3 تعليقات · رد واحد لكل تعليق») is `note`, beside it.

export interface EventSectionProps {
  id: EventSectionId;
  title: string;
  /** The page's own condition — a matrix cell, a relation. False renders nothing. */
  gate?: boolean;
  /** Another track's slot summary. Absent when the page renders the content itself. */
  summary?: Promise<SlotSummary> | SlotSummary;
  /** The header's end — a count in words, the rule. Built from the resolved summary when it needs it. */
  note?: ReactNode | ((summary: SlotSummary | undefined) => ReactNode);
  children: ReactNode;
  className?: string;
}

export async function EventSection({ id, title, gate = true, summary, note, children, className = "" }: EventSectionProps) {
  if (!gate) return null;
  const resolved = summary ? await summary : undefined;
  if (!isSectionShown(gate, resolved)) return null;
  const aside = typeof note === "function" ? note(resolved) : note;
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={`scroll-mt-4 ${className}`}>
      <SectionHeader id={`${id}-heading`} title={title} actions={aside ? <span className="text-caption text-fg-muted">{aside}</span> : undefined} />
      <div className="mt-3">{children}</div>
    </section>
  );
}
