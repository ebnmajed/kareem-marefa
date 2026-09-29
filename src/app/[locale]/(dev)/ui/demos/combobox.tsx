"use client";

import { Combobox } from "@/components/ui/combobox";
import type { ComboboxOption } from "@/components/ui";

// The gallery's `combobox` demo — contract 4 (DEC-183 §5, DEC-186). Every
// state, from literal fixtures: no DAL, no session. The lead renders it
// inside the playground's scope.

const PRESENTERS: ComboboxOption[] = [
  { value: "p1", label: "سارة العتيبي", hint: "قسم البيانات" },
  { value: "p2", label: "خالد الحربي" },
  { value: "p3", label: "منى القحطاني", hint: "قسم التصميم" },
];

export function ComboboxDemo() {
  return (
    <div data-demo="combobox" className="flex flex-col gap-6">
      <div className="max-w-sm">
        <Combobox name="presenter-single" options={PRESENTERS} placeholder="اختر مقدِّمًا" />
      </div>
      <div className="max-w-sm">
        <Combobox name="presenter-multi" options={PRESENTERS} multiple defaultValue={["p1", "p3"]} />
      </div>
      <div className="max-w-sm">
        <Combobox name="presenter-create" options={PRESENTERS} allowCreate placeholder="ابحث أو أضف اسمًا" />
      </div>
    </div>
  );
}
