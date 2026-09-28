import type { RankRowProps } from "@/components/ui";
import { RankRow } from "@/components/ui/rank-row";

// `rank-row`'s gallery entry — REQ-UIX-037, contract 4 (DEC-183, DEC-186).
//
// Literals only: no DAL, no session, no catalogue. Every state, from fixtures.
// It carries NO scope of its own: `playground.tsx` renders it on each ground.
//
// ★ The team colours below are DATA (DEC-183 §4.11) — the gallery carries the
// proposed mapping as fixtures. They never appear in a primitive.
//
// ★ Row 4 FELL (3 → 4); row 5 is the viewer, who ROSE (6 → 5). Look at row 4:
// it must be indistinguishable from rows 1–3.

const TEAM = {
  mawahib: "#35d0ff",
  jathr: "#3be8b0",
  peninsulaStory: "#ff4fb8",
  aik: "#9b7cff",
  sanf: "#ff9a2e",
} as const;

const BOARD: RankRowProps[] = [
  { rank: 1, rankLabel: "المركز 1", memberId: "demo-sara", displayName: "سارة القحطاني", company: "مواهب", teamColor: TEAM.mawahib, points: "1,410", pointsLabel: "1,410 نقطة", href: "/app/members/demo-sara" },
  { rank: 2, rankLabel: "المركز 2", memberId: "demo-mohammed", displayName: "محمد الدوسري", company: "جذر", teamColor: TEAM.jathr, points: "1,205", pointsLabel: "1,205 نقاط" },
  { rank: 3, rankLabel: "المركز 3", memberId: "demo-reem", displayName: "ريم الشهري", company: "بنينسولا ستوري", teamColor: TEAM.peninsulaStory, points: "980", pointsLabel: "980 نقطة" },
  {
    rank: 4,
    rankLabel: "المركز 4",
    memberId: "demo-fahad",
    displayName: "فهد العنزي",
    company: "أيك",
    teamColor: TEAM.aik,
    points: "715",
    pointsLabel: "715 نقطة",
    movement: { previousRank: 3, riseLabel: "—" },
  },
  {
    rank: 5,
    rankLabel: "المركز 5",
    memberId: "demo-you",
    displayName: "يوسف الحربي",
    company: "صنف",
    teamColor: TEAM.sanf,
    points: "680",
    pointsLabel: "680 نقطة",
    selfLabel: "أنت",
    movement: { previousRank: 6, riseLabel: "تقدّم مركزًا واحدًا" },
  },
  { rank: 6, rankLabel: "المركز 6", memberId: "demo-noura", displayName: "نورة السبيعي", company: null, teamColor: null, points: "540", pointsLabel: "540 نقطة" },
  {
    rank: 7,
    rankLabel: "المركز 7",
    memberId: "demo-abdulrahman",
    displayName: "عبد الرحمن بن عبد العزيز آل مقرن",
    company: "شركة بلا لون فريق بعد",
    teamColor: null,
    points: "12,030",
    pointsLabel: "12,030 نقطة",
  },
];

const SELF: RankRowProps = {
  rank: 9,
  rankLabel: "المركز 9",
  memberId: "demo-you",
  displayName: "يوسف الحربي",
  company: "صنف",
  teamColor: TEAM.sanf,
  points: "402",
  pointsLabel: "402 نقطة",
  selfLabel: "أنت",
};

export function RankRowDemo() {
  return (
    <div data-demo="rank-row" className="flex max-w-xl flex-col gap-6">
      <ul className="flex flex-col gap-2">
        {BOARD.map((row) => (
          <RankRow key={row.memberId} {...row} />
        ))}
      </ul>
      <figure className="flex flex-col gap-2">
        <figcaption className="text-caption text-fg-muted">صفّك بلا تغيير، ثم صفّك وقد نزل من 7 إلى 9 — لا فرق بينهما</figcaption>
        <ul className="flex flex-col gap-2">
          <RankRow {...SELF} />
          <RankRow {...SELF} movement={{ previousRank: 7, riseLabel: "—" }} />
        </ul>
      </figure>
    </div>
  );
}
