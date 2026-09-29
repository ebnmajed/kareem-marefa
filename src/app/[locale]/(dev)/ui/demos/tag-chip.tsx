"use client";

import { TagChip } from "@/components/ui/tag-chip";

// The gallery's `tag-chip` demo — contract 4 (DEC-183 §5, DEC-186). Every state,
// from literal fixtures: no DAL, no session. The lead renders it inside the
// playground's scope; a client module only because `onRemove` is a function.

export function TagChipDemo() {
  return (
    <div data-demo="tag-chip" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <TagChip label="تقارير" />
        <TagChip label="أتمتة" count={12} />
        <TagChip label="قيادة" href="/ar/ui" />
        <TagChip label="تصميم" href="/ar/ui" selected />
        <TagChip label="تحليل البيانات" count={1250} href="/ar/ui" selected />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TagChip label="مبيعات" onRemove={() => {}} removeLabel="أزل الوسم: مبيعات" />
        <TagChip label="الوسم: فني" removeHref="/ar/ui" removeLabel="أزل عامل التصفية: فني" selected />
      </div>
    </div>
  );
}
