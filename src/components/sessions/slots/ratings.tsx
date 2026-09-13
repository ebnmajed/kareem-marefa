import type { SlotProps } from "@/components/sessions/slots";

// Placeholder for the `Ratings` slot (TEAM.md §2). Renders nothing.
//
// `event` owns the real one at src/components/event/ratings.tsx. When it lands, the event page
// swaps this import for that one and this file is deleted — nothing else
// changes, because the props are the published `SlotProps`.
//
// Refs: REQ-RAT-001, DEC-040
export function Ratings(props: SlotProps) {
  void props; // the shape is the contract; the placeholder renders nothing
  return null;
}
