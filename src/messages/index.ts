// The message catalogue is split by namespace so teammates own disjoint
// files (DEC-040): `marketing.json` carries the frozen pre-launch copy and is
// lead-only; every platform surface owns its own file. Add a namespace here
// AND create `ar/<name>.json` first (Arabic is the source, invariant 10) —
// `en/<name>.json` may lag until the English catalogue exists.
export const NAMESPACES = ["marketing", "ui", "auth", "app", "profile", "proposals", "event", "ratings", "rsvp", "checkin", "admin", "sessions", "notifications", "scoring", "calendar", "leaderboards", "recognition", "materials", "photos", "tasks"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export async function loadMessages(locale: string): Promise<Record<string, unknown>> {
  const parts = await Promise.all(
    NAMESPACES.map(async (ns) => {
      try {
        return (await import(`./${locale}/${ns}.json`)).default as Record<string, unknown>;
      } catch {
        // A namespace without an English file falls back to Arabic, which is
        // never missing; /en platform routes redirect anyway (STORY-INT-004).
        return (await import(`./ar/${ns}.json`)).default as Record<string, unknown>;
      }
    }),
  );
  return Object.assign({}, ...parts);
}
