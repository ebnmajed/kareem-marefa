"use client";

import { DateTime } from "@/components/ui/date-time";

// The gallery's `date-time` demo — contract 4 (DEC-183 §5, DEC-186). Every
// state, from literal fixtures: no DAL, no session. `date-time.tsx` itself
// wraps `src/components/admin/rtl-datetime-picker.tsx`, whose tokens carry
// the visible weight this wave (DEC-186 §8).

export function DateTimeDemo() {
  return (
    <div data-demo="date-time" className="flex flex-col gap-6">
      <DateTime
        id="starts-at"
        name="startsAt"
        label="بداية الجلسة"
        defaultValue="2026-09-16T18:00"
      />
      <DateTime id="deadline" name="deadline" label="آخر موعد للحجز" defaultValue="" granularity="date" />
    </div>
  );
}
