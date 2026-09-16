import type { ViewerRelation } from "@/lib/session-status";

// The event-page slot contract (TEAM.md §2, DEC-040; wave 6, DEC-130).
//
// `src/app/[locale]/app/sessions/[id]/page.tsx` renders the session and
// leaves named slots. Each slot is a **server component** that fetches its
// own data through its owner's DAL: the page passes ids, never rows. That is
// what keeps several teammates out of each other's files while sharing one
// surface.
//
// This shape is published by `sessions` and never changed without telling
// the lead. The full contract — section order, ids, headings and who gates
// what — is `docs/plan/notes/sessions.md` §22.

export type SlotProps = {
  /** The session's uuid. The slot re-reads the session itself if it needs it. */
  sessionId: string;
  /** The viewer's member id (`session.memberId`), never their user id. */
  memberId: string;
  /** The active locale, for `getTranslations` and `Link`. */
  locale: string;
};

/**
 * ★ The contract, widened once — DEC-092, DEC-103.
 *
 * A slot that must know the viewer's relation to the session takes it as a
 * prop rather than re-reading it. No slot is REQUIRED to take it: the page
 * owns the condition on a section (`16` §5.4.1a(b)), so a slot inside a gated
 * section never has to know. A derived enum is not a row, so "ids, never
 * rows" survives.
 */
export type RelationSlotProps = SlotProps & { viewerRelation: ViewerRelation };

/**
 * ★ What the page must know about a slot BEFORE it renders the slot's section
 * — wave 6.
 *
 * `16` §5.4.1a(b): a slot that can render nothing must have its `<section>` and
 * `<h2>` gated with it, and the page owns that landmark. But the page cannot
 * see what a child server component rendered, so each slot's owner exports a
 * reader beside the component that answers the question from the SAME
 * request-scoped read the component uses — `cache()` in the DAL, so the gate
 * costs no second round trip.
 *
 * The one invariant the owner proves in its own test: `visible === false`
 * exactly when the slot returns `null` for this viewer.
 */
export interface SlotSummary {
  /** False: the page renders no `<section>`, no `<h2>` and no sub-nav entry. */
  visible: boolean;
  /** Items this viewer can see. */
  count: number;
  /** Tasks only: not yet completed by this viewer — the action card's «المهام التحضيرية (2)». */
  outstanding: number | null;
}

export type SlotSummaryReader = (props: SlotProps) => Promise<SlotSummary>;

/**
 * The event page's sections, in render order — each a `<section id>` labelled
 * by `<h2 id="{id}-heading">`. The ids are stable: the sub-nav, deep links and
 * the other tracks' e2e specs address them.
 *
 * `objectives` is RESERVED and not rendered this wave: REQ-SES-014's column
 * does not exist yet.
 */
export const EVENT_SECTION_IDS = ["attend", "about", "presenters", "tasks", "materials", "photos", "discussion", "rating"] as const;
export type EventSectionId = (typeof EVENT_SECTION_IDS)[number] | "objectives";

/** The slots the event page renders, in render order. */
export const SLOT_NAMES = ["RsvpPanel", "AttendanceOutcome", "AddToCalendar", "Tasks", "Materials", "Photos", "Comments", "Ratings"] as const;
export type SlotName = (typeof SLOT_NAMES)[number];

/**
 * Whether a section is rendered: the page's own condition AND, when the
 * section holds another track's slot, that slot's summary. One function, so
 * the section and its sub-nav entry can never disagree.
 */
export function isSectionShown(gate: boolean, summary?: SlotSummary | null): boolean {
  if (!gate) return false;
  return summary ? summary.visible : true;
}
