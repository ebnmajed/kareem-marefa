import type { SlotProps } from "@/components/sessions/slots";

// Placeholder for the `RsvpPanel` slot (TEAM.md §2). Renders nothing.
//
// `checkin` owns the real one at src/components/checkin/rsvp-panel.tsx. When it lands, the event page
// swaps this import for that one and this file is deleted — nothing else
// changes, because the props are the published `SlotProps`.
//
// Refs: REQ-RSV-001, DEC-040
export function RsvpPanel(props: SlotProps) {
  void props; // the shape is the contract; the placeholder renders nothing
  return null;
}
