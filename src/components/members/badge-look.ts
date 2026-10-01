import type { MedallionFill } from "@/components/ui";

// What a badge's medallion wears — DEC-214 §3, N1: DERIVED from its rule's metric, no column.
//
// `badges` stores no colour and no glyph (`0027:147-159`), and an admin may make a badge (`REQ-REC-001`) — but every
// badge's `rule->>'metric'` comes from one fixed vocabulary (`0027:543-559`, the evaluator's), so the look is a
// function of WHAT IT REWARDS: attending, presenting, a streak, rating, being rated well, or an admin's hand. A
// metric this file does not know falls back to the gold disc and the star. The fill is the stickers' set by name
// (`MedallionFill`) — never a company's colour, never a status's.
export type BadgeGlyph = "check" | "users" | "calendar" | "chart" | "star";

const LOOK: Record<string, { fill: MedallionFill; glyph: BadgeGlyph }> = {
  check_ins_count: { fill: "cyan", glyph: "check" },
  sessions_delivered_count: { fill: "accent", glyph: "users" },
  streak_awards_count: { fill: "signal", glyph: "calendar" },
  ratings_submitted_count: { fill: "violet", glyph: "chart" },
  presenter_rating_avg: { fill: "gold", glyph: "star" },
  manual: { fill: "bone", glyph: "star" },
};

const FALLBACK = { fill: "gold", glyph: "star" } as const;

export function badgeLook(metric: string | null | undefined): { fill: MedallionFill; glyph: BadgeGlyph } {
  return (metric && LOOK[metric]) || FALLBACK;
}
