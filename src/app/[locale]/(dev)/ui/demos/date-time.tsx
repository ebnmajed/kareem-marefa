"use client";

import { DateTime } from "@/components/ui/date-time";
import type { DemoGround } from "../ground";

// The gallery's `date-time` demo — contract 4 (DEC-183 §5, DEC-186). Every
// state, from literal fixtures: no DAL, no session. `date-time.tsx` itself
// wraps `src/components/admin/rtl-datetime-picker.tsx`, whose tokens carry
// the visible weight this wave (DEC-186 §8).
//
// ★ `ground.ts`: the gallery renders every demo twice, once per ground, and
// this demo names ids — suffixed with `ground` so a label in one ground
// never points at the other's control.

export function DateTimeDemo({ ground }: { ground: DemoGround }) {
  return (
    <div data-demo="date-time" className="flex flex-col gap-6">
      <DateTime
        id={`starts-at-${ground}`}
        name="startsAt"
        label="بداية الجلسة"
        defaultValue="2026-09-16T18:00"
      />
      <DateTime id={`deadline-${ground}`} name="deadline" label="آخر موعد للحجز" defaultValue="" granularity="date" />
    </div>
  );
}
