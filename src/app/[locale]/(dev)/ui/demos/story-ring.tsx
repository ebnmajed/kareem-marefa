import { StoryRing } from "@/components/ui/story-ring";

// The gallery's `story-ring` demo — contract 4 (DEC-183 §5, DEC-186 §4 – §5,
// REQ-UIX-040). The four states in the order the home row sorts them (live,
// today, the week, recap), a seen ring, and an upcoming ring of a company with no
// colour. From literal fixtures; the lead renders it inside the playground's
// scope. Static: the live ring does not pulse. Nothing opens — the viewer is a
// later wave's.

const RINGS = [
  { state: "live", glyph: "م", title: "العرض في 5 شرائح", stateLabel: "مباشر", caption: "الآن", teamColor: "#35D0FF" },
  { state: "upcoming", glyph: "ص", title: "لوحة تحكم لا يهجرها أحد", stateLabel: "قادمة", caption: "اليوم", teamColor: "#FF9A2E" },
  { state: "upcoming", glyph: "ج", title: "تحليل البيانات", stateLabel: "قادمة", caption: "الخميس", teamColor: "#3BE8B0" },
  { state: "upcoming", glyph: "ع", title: "جلسة عامة", stateLabel: "قادمة", caption: "الأحد", teamColor: null },
  { state: "recap", glyph: "د", title: "أتمتة التقارير", stateLabel: "ملخص", caption: "أمس", teamColor: "#FFD23F" },
  { state: "seen", glyph: "أ", title: "تصميم الاستبيانات", stateLabel: "شوهدت", caption: "الثلاثاء", teamColor: "#9B7CFF" },
] as const;

export function StoryRingDemo() {
  return (
    // Wraps, so every state is in the box at 390 px (the lead's review: scrolled, «ملخص» and
    // «شوهدت» fell outside the capture). The home row's sideways scroll is a screen's, later.
    <div data-demo="story-ring" className="flex flex-wrap gap-3 p-2">
      {RINGS.map((ring) => (
        <StoryRing
          key={`${ring.state}-${ring.glyph}`}
          state={ring.state}
          glyph={ring.glyph}
          stateLabel={ring.stateLabel}
          caption={ring.caption}
          teamColor={ring.teamColor}
          label={`قصة جلسة: ${ring.title}، ${ring.stateLabel}، ${ring.caption}`}
        />
      ))}
    </div>
  );
}
