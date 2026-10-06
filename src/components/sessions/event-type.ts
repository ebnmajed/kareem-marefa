// A session's event type — REQ-SES-022, DEC-267, migration 0213's `public.event_type`.
//
// The four kinds of event the baseline poster families name, in the enum's order. Here rather than in the DAL so a
// client form can list them: `lib/dal/sessions.ts` is `server-only` and re-exports these. A session with no choice
// made is a talk («محاضرة») — the column's default, and the form's.
//
// Labels are `sessions.eventType.<type>`, and the field is `sessions.eventType.label` («نوع الفعالية») on every
// screen. «إعلان» is an announcement's family, never an event type.

export const EVENT_TYPES = ["talk", "workshop", "panel", "meetup"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const DEFAULT_EVENT_TYPE: EventType = "talk";

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}

/** A column value read from the database, narrowed — anything unexpected reads as the default. */
export function eventTypeOf(value: unknown): EventType {
  return isEventType(value) ? value : DEFAULT_EVENT_TYPE;
}
