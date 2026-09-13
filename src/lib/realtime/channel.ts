"use client";

import { createBrowserClient } from "@/lib/supabase/browser";

// The one place a Realtime channel is opened (TEAM.md §2, DEC-040). Every
// channel in this product is PRIVATE (03 §7.1, DEC-022): a public channel
// can be subscribed to without authentication at all, which would place
// data outside RLS entirely. Because this is the only function that calls
// `.channel(...)`, there is exactly one place that guarantee could ever
// slip — and it is hard-coded here, not passed in.
//
// RLS on `realtime.messages` (supabase/proposed/event/01_realtime_authorization.sql)
// is what actually enforces org isolation once the socket authenticates;
// this file only shapes how the app talks to a channel, never the boundary
// itself.

export type BroadcastMessage = {
  /** As sent by the trigger: "INSERT" / "UPDATE" for a table row, or a
   *  named application event like "reaction_totals". Never "DELETE" — the
   *  tables broadcasting on these topics are soft-delete only. */
  event: string;
  payload: Record<string, unknown>;
};

export type Unsubscribe = () => void;

function subscribeToTopic(topic: `session:${string}` | `host:${string}`, onMessage: (message: BroadcastMessage) => void): Unsubscribe {
  const supabase = createBrowserClient();
  const channel = supabase.channel(topic, { config: { private: true } });
  channel
    .on("broadcast", { event: "*" }, (message) => {
      onMessage({ event: message.event, payload: (message.payload as Record<string, unknown>) ?? {} });
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * The event page's live stream: comments (INSERT/UPDATE) and reaction
 * totals (03 §7.4 — counts, never rows). Server-rendered data is correct on
 * first paint regardless (REQ-EVT-015's DEC-020 fallback); this only keeps
 * it live without a manual refresh.
 */
export function subscribeToSessionTopic(sessionId: string, onMessage: (message: BroadcastMessage) => void): Unsubscribe {
  return subscribeToTopic(`session:${sessionId}`, onMessage);
}

/**
 * The host view's live check-in count (SCR-016, checkin's screen). Exported
 * from here — not duplicated in checkin's folder — because this is the one
 * file allowed to call `.channel()` at all.
 */
export function subscribeToHostTopic(sessionId: string, onMessage: (message: BroadcastMessage) => void): Unsubscribe {
  return subscribeToTopic(`host:${sessionId}`, onMessage);
}
