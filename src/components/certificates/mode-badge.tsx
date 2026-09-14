import type { DesignerSlotProps } from "@/components/posters/slots";

// The `CertificateModeBadge` slot — REQ-CRT-002.
//
// "The mode is visible on the event page so attendees know what to expect."
// Reads `sessions.certificate_mode` (0010) through this track's DAL and shows
// معطّل / تلقائي عند اكتمال الجلسة / مراجعة وإصدار يدوي.
//
// PLACEHOLDER until STORY-CRT-001. `off` is the column's default and the mode
// most sessions carry, and `off` renders nothing even when this is real — so
// the placeholder is the correct output for the common case already.
export async function CertificateModeBadge(_props: DesignerSlotProps) {
  return null;
}
