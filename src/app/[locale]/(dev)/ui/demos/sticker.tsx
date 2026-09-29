import type { CSSProperties } from "react";
import type { StickerFill } from "@/components/ui";
import { Sticker } from "@/components/ui/sticker";

// The gallery's `sticker` demo — contract 4 (DEC-183 §5, DEC-186 §5,
// REQ-UIX-031). Every fill, both sizes, the rotation's ends, and three grounds —
// the rim is drawn from whatever the sticker sits on. From literal fixtures;
// the lead renders it inside the playground's scope. Static: the overshoot is
// the moments' wave's.

const FILLS: { fill: StickerFill; word: string }[] = [
  { fill: "accent", word: "محجوز" },
  { fill: "signal", word: "جارية الآن" },
  { fill: "cyan", word: "قائمة الانتظار · 3" },
  { fill: "gold", word: "+50 عند الحضور" },
  { fill: "violet", word: "مستوى جديد" },
  { fill: "bone", word: "حضرت" },
];

// A team colour as a poster's ground: the demo's own data (DEC-183 §4.11).
const TANGERINE = { backgroundColor: "#FF9A2E", ["--sticker-ground" as string]: "#FF9A2E" } as CSSProperties;

export function StickerDemo() {
  return (
    <div data-demo="sticker" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-5 p-2">
        {FILLS.map(({ fill, word }, i) => (
          <Sticker key={fill} fill={fill} rotate={i % 2 === 0 ? -4 : 3}>
            {word}
          </Sticker>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-5 p-2">
        <Sticker size="sm" rotate={-6}>
          محجوز
        </Sticker>
        <Sticker size="sm" rotate={0} fill="bone">
          بلا ميل
        </Sticker>
        <Sticker size="md" rotate={6} fill="gold">
          +50
        </Sticker>
        <Sticker informative fill="violet">
          مستوى جديد: صاحب أثر
        </Sticker>
      </div>

      {/* On the raised surface, and on a team colour — the rim follows the ground. */}
      <div className="flex flex-wrap gap-4">
        <div className="rounded-tile bg-raised p-6 [--sticker-ground:var(--raised)]">
          <Sticker>محجوز</Sticker>
        </div>
        <div className="rounded-tile p-6" style={TANGERINE}>
          <Sticker fill="bone" rotate={5}>
            +50 عند الحضور
          </Sticker>
        </div>
      </div>
    </div>
  );
}
