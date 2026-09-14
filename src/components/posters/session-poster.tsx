import type { DesignerSlotProps } from "@/components/posters/slots";

// The `SessionPoster` slot — REQ-DSG-001, REQ-DSG-002, DEC-012.
//
// Item 1 of the event page and the image on every browse card: the session's
// poster in whichever variant the host asks for, from `session_posters` →
// `export_artifacts` through this track's DAL.
//
// PLACEHOLDER. It renders nothing until STORY-DSG-001, so a session with no
// poster row looks exactly like today rather than like a broken image — which
// is also the correct terminal state for a session whose render has not
// finished. The lead is told when it becomes real.
export async function SessionPoster(_props: DesignerSlotProps) {
  return null;
}
