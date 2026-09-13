import type { SlotProps } from "@/components/sessions/slots";

// Placeholder for the `Comments` slot (TEAM.md §2). Renders nothing.
//
// `event` owns the real one at src/components/event/comments.tsx. When it lands, the event page
// swaps this import for that one and this file is deleted — nothing else
// changes, because the props are the published `SlotProps`.
//
// Refs: REQ-EVT-001, DEC-040
export function Comments(props: SlotProps) {
  void props; // the shape is the contract; the placeholder renders nothing
  return null;
}
