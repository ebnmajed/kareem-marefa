// The inbox's date groups — `Notifications.dc.html`, `M10c.md` §6, REQ-UIX-076.
//
// «اليوم», then «هذا الأسبوع», then «أقدم», each read in the ORG's zone (A20): an item's day is the room's day, not the
// reader's. The week is `DEC-217` §3.4's — Saturday to Friday — the same week the board ranks, so «هذا الأسبوع» means
// one thing in the app. An item is grouped by ITS OWN day (D10, DEC-218 §2.4): the artboard draws «أمس 8:02 م» under
// «اليوم», and that is the drawing's slip, not a rule.

export type InboxGroup = "today" | "week" | "older";

const WEEKDAY_INDEX: Record<string, number> = { Sat: 0, Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6 };

/** The calendar day of an instant in a zone, as a day number since the epoch, and its place in a Sat–Fri week. */
function dayOf(instant: Date, timeZone: string): { day: number; weekday: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return {
    day: Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  };
}

export function inboxGroup(createdAt: string, now: Date, timeZone: string): InboxGroup {
  const item = dayOf(new Date(createdAt), timeZone).day;
  const today = dayOf(now, timeZone);
  if (item >= today.day) return "today";
  const weekStart = today.day - today.weekday;
  return item >= weekStart ? "week" : "older";
}

/** Items in their order, cut into consecutive groups — the list is newest first, so each group appears once. */
export function groupInbox<T extends { createdAt: string }>(items: T[], now: Date, timeZone: string): { group: InboxGroup; items: T[] }[] {
  const out: { group: InboxGroup; items: T[] }[] = [];
  for (const item of items) {
    const group = inboxGroup(item.createdAt, now, timeZone);
    const last = out.at(-1);
    if (last && last.group === group) last.items.push(item);
    else out.push({ group, items: [item] });
  }
  return out;
}
