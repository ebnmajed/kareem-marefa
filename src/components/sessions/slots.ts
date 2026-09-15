import type { ViewerRelation } from "@/lib/session-status";

// The event-page slot contract (TEAM.md §2, DEC-040).
//
// `src/app/[locale]/app/sessions/[id]/page.tsx` renders the session and
// leaves three named slots. Each slot is a **server component** that fetches
// its own data through its owner's DAL: the page passes ids, never rows.
// That is what keeps three teammates out of each other's files while sharing
// one surface.
//
//   checkin  implements  src/components/checkin/rsvp-panel.tsx  → RsvpPanel(props: SlotProps)
//   event    implements  src/components/event/comments.tsx      → Comments(props: SlotProps)
//   event    implements  src/components/event/ratings.tsx       → Ratings(props: SlotProps)
//
// All three are implemented as of wave 1, so the no-op placeholders that
// stood in for them under `./slots/` are gone. This type stays: it is what the
// three implementations and the page agree on, and it is the reason none of
// the three teammates ever had to read each other's code.
//
// This shape is published by `sessions` and never changed without telling
// the lead: three props, all strings, all required.

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
 * prop rather than re-reading it. `getSessionForEvent()` derives it once; four
 * slots re-deriving it would be four extra round trips on the product's most
 * important page.
 *
 * It is OPTIONAL on `SlotProps` deliberately: the three wave-1 slots do not
 * need it and must not be forced to accept it, and a required prop here would
 * be a breaking change to three teammates' files at once. A derived enum is
 * not a row, so "ids, never rows" survives.
 *
 * ★★ In M9 almost nothing uses it, and that is the design: `16` §5.4.1a(b)
 * says a slot that can render nothing must have its `<section>` AND heading
 * gated with it, so THE PAGE owns the condition — gate the section, and the
 * slot inside it never has to know. `event` learned this for Ratings at 390 px
 * in wave 1 and nobody generalised it; this is the generalisation.
 */
export type RelationSlotProps = SlotProps & { viewerRelation: ViewerRelation };

/** The three slot names the event page renders, in render order. */
/** ★ `AttendanceOutcome` joins in M9 (`16` §16.0): `checkin`'s, the ended read-only fact. */
export const SLOT_NAMES = ["RsvpPanel", "AttendanceOutcome", "Comments", "Ratings"] as const;
export type SlotName = (typeof SLOT_NAMES)[number];
