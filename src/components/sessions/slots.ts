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

/** The three slot names the event page renders, in render order. */
export const SLOT_NAMES = ["RsvpPanel", "Comments", "Ratings"] as const;
export type SlotName = (typeof SLOT_NAMES)[number];
