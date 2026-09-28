import type { ReactNode } from "react";
import type { LevelFace } from "@/components/ui";
import { LevelCard } from "@/components/ui/level-card";

// `level-card`'s gallery entry — REQ-UIX-039, contract 4 (DEC-183, DEC-186).
//
// Literals only: no DAL, no session, no catalogue — deterministic enough to
// diff. Every state, from fixtures. It carries NO scope of its own: the
// gallery's `playground.tsx` renders it once on each of the scope's grounds
// (scopes do not nest).
//
// ★ The privileges named here are the two the tree can grant (`perks.key`,
// `0027:286`), shown as an org that has ENABLED them would see them. In a
// default org both are off and every face says `noUnlocksLabel` (DEC-186 §7).

const LABELS = { unlocksLabel: "يفتح لك", noUnlocksLabel: "لا امتياز مرتبط بهذا المستوى بعد" };

const FIRST: LevelFace = { tier: 1, name: "مشارِك", caption: "مستواك الحالي", unlocks: [] };
const HELD: LevelFace = { tier: 3, name: "صاحب أثر", caption: "مستواك الحالي", unlocks: ["أولوية الحجز"] };
const REACHED: LevelFace = { tier: 4, name: "كريم معرفة", caption: "مستوى جديد", unlocks: ["الحق في اقتراح جلسة"] };
const RAMP: LevelFace[] = [
  { tier: 1, name: "مشارِك", caption: "مستوى جديد", unlocks: [] },
  { tier: 2, name: "مشارِك نشِط", caption: "مستوى جديد", unlocks: [] },
  { tier: 3, name: "صاحب أثر", caption: "مستوى جديد", unlocks: ["أولوية الحجز"] },
  { tier: 4, name: "كريم معرفة", caption: "مستوى جديد", unlocks: ["الحق في اقتراح جلسة"] },
  { tier: 5, name: "سفير المعرفة", caption: "مستوى جديد", unlocks: [] },
];

function State({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="flex w-full max-w-xs flex-col gap-2">
      <figcaption className="text-caption text-fg-muted">{title}</figcaption>
      {children}
    </figure>
  );
}

function States() {
  return (
    <div className="flex flex-wrap gap-6">
      <State title="المستوى الأول وحده، بلا امتياز">
        <LevelCard level={FIRST} {...LABELS} />
      </State>
      <State title="مستوى بامتياز مفعَّل">
        <LevelCard level={HELD} {...LABELS} />
      </State>
      <State title="بلغ مستوى جديدًا — قبل القلب">
        <LevelCard level={HELD} reached={REACHED} shown="level" {...LABELS} />
      </State>
      <State title="بلغ مستوى جديدًا — بعد القلب، وهو نفسه مع تقليل الحركة">
        <LevelCard level={HELD} reached={REACHED} shown="reached" {...LABELS} />
      </State>
      <State title="اسم مستوى طويل غيّرته المؤسسة">
        <LevelCard
          level={HELD}
          reached={{ tier: 5, name: "سفير المعرفة في المؤسسة كلها", caption: "مستوى جديد", unlocks: ["أولوية الحجز", "الحق في اقتراح جلسة"] }}
          shown="reached"
          {...LABELS}
        />
      </State>
      {RAMP.map((face) => (
        <State key={face.tier} title={`درجة المستوى ${face.tier}`}>
          <LevelCard level={FIRST} reached={face} shown="reached" {...LABELS} />
        </State>
      ))}
    </div>
  );
}

export function LevelCardDemo() {
  // `data-demo` is the handle `wave15-scoring-gallery.spec.ts` captures by.
  return (
    <div data-demo="level-card">
      <States />
    </div>
  );
}
