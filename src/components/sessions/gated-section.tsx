import type { ReactNode } from "react";
import { SectionHeader } from "@/components/ui/section-header";
import { isSectionShown, type EventSectionId, type SlotSummary } from "@/components/sessions/slots";

// One section of the event page — `16` §5.4.1a(b), REQ-UIX-015, DEC-130.
//
// ★ THE PAGE OWNS THE LANDMARK, SO THE PAGE OWNS THE CONDITION. A slot that can
// render nothing must take its `<section>` and its `<h2>` with it, or every
// viewer the slot has nothing for sees an empty «المهام» on every session. The
// rule was learned once, for Ratings at 390 px in wave 1, and never
// generalised; this component is the generalisation, and every event-page
// section goes through it.
//
// An async server component so a slot's summary can stream: the page wraps
// each one in `<Suspense>` and the hero and action card paint first. The
// summary is only awaited when the page's own gate is open.
//
// `<section id>` is the jump target and `<h2 id="{id}-heading">` names the
// region — the exact region names other tracks' specs select on («المواد»,
// «الصور») come from `title`, so no count is ever put inside the heading here.

export interface GatedSectionProps {
  id: EventSectionId;
  title: string;
  /** The page's own condition — a matrix cell, a relation. False renders nothing. */
  gate?: boolean;
  /** Another track's slot summary. Absent when the page renders the content itself. */
  summary?: Promise<SlotSummary> | SlotSummary;
  children: ReactNode;
  className?: string;
}

export async function GatedSection({ id, title, gate = true, summary, children, className = "" }: GatedSectionProps) {
  if (!gate) return null;
  const resolved = summary ? await summary : undefined;
  if (!isSectionShown(gate, resolved)) return null;

  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={className}>
      <SectionHeader id={`${id}-heading`} title={title} />
      <div className="mt-4">{children}</div>
    </section>
  );
}
