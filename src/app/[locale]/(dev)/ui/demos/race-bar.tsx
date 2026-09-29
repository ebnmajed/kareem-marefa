import type { RaceBarProps } from "@/components/ui";
import { RaceBar } from "@/components/ui/race-bar";

// `race-bar`'s gallery entry — REQ-UIX-038, contract 4 (DEC-183, DEC-186).
//
// Literals only: no DAL, no session, no catalogue. Every state, from fixtures.
// It carries NO scope of its own: `playground.tsx` renders it on each ground.
//
// ★ The team colours below are DATA (DEC-183 §4.11) — the gallery carries the
// proposed mapping as fixtures. They never appear in a primitive.
//
// Two groups: SCR-010's widget (the ranked metric alone), and SCR-028's board,
// which keeps both metrics (REQ-LDR-004). `fraction` is each company's value
// over the leader's, computed here as the adopting board will compute it.

const METRIC = "نقاط لكل عضو نشِط";

interface Company {
  name: string;
  teamColor: string | null;
  perMember: number;
  perMemberText: string;
  total: string;
}

const COMPANIES: Company[] = [
  { name: "مواهب", teamColor: "#35d0ff", perMember: 9.4, perMemberText: "9.4", total: "2,310" },
  { name: "بنينسولا ستوري", teamColor: "#ff4fb8", perMember: 8.7, perMemberText: "8.7", total: "1,915" },
  { name: "صنف", teamColor: "#ff9a2e", perMember: 7.3, perMemberText: "7.3", total: "1,204" },
  { name: "شركة لم تختر لونًا بعد", teamColor: null, perMember: 3.1, perMemberText: "3.1", total: "412" },
  // A total below zero: reversals and manual adjustments can take it there. The track is empty and the number keeps its sign.
  { name: "دبابيس", teamColor: "#ffd23f", perMember: -0.4, perMemberText: "‎-0.4", total: "‎-12" },
];

const LEADER = Math.max(...COMPANIES.map((c) => c.perMember));
const OWN = "صنف";

function bars(withSecondary: boolean): RaceBarProps[] {
  return COMPANIES.map((c, i) => ({
    companyName: c.name,
    teamColor: c.teamColor,
    value: c.perMemberText,
    metricLabel: METRIC,
    fraction: c.perMember / LEADER,
    rank: i + 1,
    rankLabel: `المركز ${i + 1}`,
    ownLabel: c.name === OWN ? "فريقك" : null,
    secondary: withSecondary ? { label: "إجمالي النقاط", value: c.total } : null,
  }));
}

function Group({ title, rows }: { title: string; rows: RaceBarProps[] }) {
  return (
    <figure className="flex max-w-xl flex-col gap-2">
      <figcaption className="text-caption text-fg-muted">{title}</figcaption>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <RaceBar key={row.companyName} {...row} />
        ))}
      </ul>
    </figure>
  );
}

export function RaceBarDemo() {
  return (
    <div data-demo="race-bar" className="flex flex-col gap-6">
      <Group title="سباق الشركات — الترتيب حسب النقاط لكل عضو نشِط" rows={bars(false)} />
      <Group title="وعلى لوحة الشركات، المقياسان معًا" rows={bars(true)} />
    </div>
  );
}
