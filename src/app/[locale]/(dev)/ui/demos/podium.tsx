import type { PodiumPlace } from "@/components/ui";
import { Podium } from "@/components/ui/podium";

// `podium`'s gallery entry — REQ-UIX-081 (DEC-216, DEC-218). Literals only. It carries NO scope of its own.
// ★ The team colours are DATA (DEC-183 §4.11) — fixtures here, never in the primitive. Three boards: the first
// three with the viewer second; a tie for first; two places only. Narrow the window, or turn on reduced motion,
// and each becomes three `rank-row`s.

const place = (rank: number, memberId: string, displayName: string, company: string | null, teamColor: string | null, points: number, selfLabel?: string): PodiumPlace => ({
  rank,
  rankLabel: `المركز ${rank}`,
  memberId,
  displayName,
  company,
  teamColor,
  points: points.toLocaleString("en-US"),
  pointsLabel: `${points.toLocaleString("en-US")} نقطة`,
  href: `/app/members/${memberId}`,
  selfLabel: selfLabel ?? null,
});

export function PodiumDemo() {
  return (
    <div data-demo="podium" className="flex max-w-md flex-col gap-8">
      <Podium
        label="المراكز الأولى"
        places={[
          place(1, "demo-sara", "سارة القحطاني", "مواهب", "#35d0ff", 210),
          place(2, "demo-you", "يمان", "صنف", "#ff9a2e", 160, "أنت"),
          place(3, "demo-mohammed", "محمد الدوسري", "جذر", "#3be8b0", 150),
        ]}
      />
      <Podium
        label="المراكز الأولى — تعادل"
        places={[
          place(1, "demo-fahad", "فهد العنزي", "أيك", "#9b7cff", 160),
          place(1, "demo-reem", "ريم الشهري", "بنينسولا ستوري", "#ff4fb8", 160),
          place(3, "demo-noura", "نورة السبيعي", null, null, 95),
        ]}
      />
      <Podium label="مركزان فقط" places={[place(1, "demo-hind", "هند الزهراني", "جذر", "#3be8b0", 40), place(2, "demo-khaled", "خالد الغامدي", "أيك", "#9b7cff", 15)]} />
    </div>
  );
}
