// The designer's slot contract (TEAM.md §2, DEC-048).
//
// Three surfaces this track does not own render a piece of M6:
//
//   the event page      → <SessionPoster>        @/components/posters/session-poster
//   browse cards        → <SessionPoster>        (same component, `console` imports it)
//   SCR-043 schedule    → <PosterPicker>         @/components/posters/picker
//   the event page      → <CertificateModeBadge> @/components/certificates/mode-badge
//   SCR-054 recognition → <HeldAchievements>     @/components/certificates/held-achievements
//
// Same rules as the event-page slots `sessions` published in wave 1: each is a
// **server component**, fetches its own data through this track's DAL, is
// passed ids and never rows, and renders **no heading of its own** — the host
// page owns the landmark and the <h2>, and a slot repeating it is announced
// twice by a screen reader.
//
// Published as no-op placeholders on day one so the importing pages compile
// before the stories land. This shape does not change without the lead
// hearing: two props, both strings, both required.

export type DesignerSlotProps = {
  /** The session's uuid. The slot re-reads whatever it needs itself. */
  sessionId: string;
  /** The active locale, for `getTranslations` and `Link`. */
  locale: string;
};

/** The slots other pages render, and who wires each one.
 *
 *  `HeldAchievements` is the late addition and the only one that WRITES.
 *  REQ-CRT-012 says a leaderboard certificate is «released by an admin»,
 *  but SCR-045 is per session and an achievement certificate has no
 *  session, so `09` gives that release nowhere to live. A slot on SCR-054
 *  is the smallest honest answer: it takes only `locale`, renders nothing
 *  unless something is actually held, and carries its own action — so
 *  `scoring`'s screen imports one component and nothing else. */
export const DESIGNER_SLOTS = ["SessionPoster", "PosterPicker", "CertificateModeBadge", "HeldAchievements"] as const;
export type DesignerSlotName = (typeof DESIGNER_SLOTS)[number];
