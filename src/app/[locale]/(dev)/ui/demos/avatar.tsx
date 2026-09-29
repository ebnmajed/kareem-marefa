import { Avatar, AvatarStack } from "@/components/ui/avatar";

// The gallery's `avatar` demo — contract 4 (DEC-183 §5, DEC-186 §5, REQ-UIX-043).
// Every state, from literal fixtures: no DAL, no session. The lead renders it
// inside the playground's scope. The team colours are the seven named defaults
// SCR-048 offers; the gallery's own demo data carries them (DEC-183 §4.11), and
// each sits beside its company's name — colour is never the only channel.

const TEAMS = [
  { company: "شبه الجزيرة", color: "#E9E4D6" },
  { company: "صنف", color: "#FF9A2E" },
  { company: "بنينسولا ستوري", color: "#FF4FB8" },
  { company: "مواهب", color: "#35D0FF" },
  { company: "دبابيس", color: "#FFD23F" },
  { company: "أيك", color: "#9B7CFF" },
  { company: "جذر", color: "#3BE8B0" },
] as const;

const NAMES = ["ريم العتيبي", "سارة القحطاني", "نورة الشهري", "فهد العنزي", "خالد الدوسري", "هند المطيري"];

export function AvatarDemo() {
  return (
    <div data-demo="avatar" className="flex flex-col gap-6">
      {/* The six tints, keyed by the member id; no team ring. */}
      <div className="flex flex-wrap items-center gap-3">
        {NAMES.map((name, i) => (
          <Avatar key={name} memberId={`demo-member-${i + 1}`} displayName={name} size={40} />
        ))}
        <Avatar memberId="demo-member-none" displayName={null} size={40} />
      </div>

      {/* The team ring: seven colours, each beside its company's name. */}
      <ul className="flex flex-wrap gap-4">
        {TEAMS.map((team, i) => (
          <li key={team.company} className="flex items-center gap-2">
            <Avatar memberId={`demo-team-${i + 1}`} displayName={NAMES[i % NAMES.length]!} teamColor={team.color} size={40} decorative />
            <span className="text-caption text-fg-body">
              <bdi>{NAMES[i % NAMES.length]}</bdi> · <bdi>{team.company}</bdi>
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <Avatar memberId="demo-team-none" displayName="منى الحربي" teamColor={null} size={40} decorative />
          <span className="text-caption text-fg-body">
            <bdi>منى الحربي</bdi> · شركة بلا لون
          </span>
        </li>
      </ul>

      {/* Every size, ringed and not. */}
      <div className="flex flex-wrap items-end gap-3">
        {([24, 32, 34, 40, 56, 96] as const).map((size) => (
          <Avatar key={size} memberId="demo-member-3" displayName="نورة الشهري" size={size} teamColor="#9B7CFF" />
        ))}
        <Avatar memberId="demo-member-3" displayName="نورة الشهري" size={96} />
      </div>

      <AvatarStack
        members={NAMES.map((name, i) => ({ memberId: `demo-member-${i + 1}`, displayName: name }))}
        size={32}
        max={3}
        overflowLabel={(n) => `و${n} آخرين`}
      />
    </div>
  );
}
