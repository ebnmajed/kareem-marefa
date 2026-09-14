// The message catalogue is split by namespace so teammates own disjoint
// files (DEC-040): `marketing.json` carries the frozen pre-launch copy and is
// lead-only; every platform surface owns its own file. Add a namespace here
// AND create `ar/<name>.json` first (Arabic is the source, invariant 10) —
// `en/<name>.json` may lag until the English catalogue exists.
export const NAMESPACES = ["marketing", "ui", "auth", "app", "profile", "proposals", "event", "ratings", "rsvp", "checkin", "admin", "sessions", "notifications", "scoring", "calendar", "leaderboards", "recognition", "materials", "photos", "tasks", "search", "browse"] as const;
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
  // Deep merge, not Object.assign: two namespaces may share a top-level key
  // (marketing.json's «التكريم» section and the scoring track's recognition
  // screens both live under `recognition`), and a shallow merge let the later
  // one replace the frozen landing page's section — the visual gate caught it
  // at wave 2 (DEC-047). tests/unit/messages-namespaces.test.ts refuses a
  // shared LEAF path, which a deep merge would otherwise hide.
  return parts.reduce<Record<string, unknown>>((acc, part) => deepMerge(acc, part), {});
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = out[key];
    out[key] =
      existing && typeof existing === "object" && !Array.isArray(existing) && value && typeof value === "object" && !Array.isArray(value)
        ? deepMerge(existing as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }
  return out;
}
