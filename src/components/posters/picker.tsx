import type { DesignerSlotProps } from "@/components/posters/slots";

// The `PosterPicker` slot — REQ-DSG-002, DEC-012, SCR-043.
//
// The three poster paths on the schedule screen: تلقائي (the default, every
// A12 variant with no design work) · تخصيص (opens SCR-057) · رفع ملصق جاهز.
// `console` owns SCR-043; the lead wires this in.
//
// PLACEHOLDER until STORY-DSG-001/002. Publishing is gated on a poster by
// `REQ-DSG-001`, and that gate is deliberately NOT wired yet (DEC-045 deferred
// it from M2 to M6) — so rendering nothing here leaves the publish flow
// exactly as wave 1 left it.
export async function PosterPicker(_props: DesignerSlotProps) {
  return null;
}
