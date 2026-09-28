"use client";

import { Tabs } from "@/components/ui/tabs";

// The gallery's `tabs` demo — contract 4 (DEC-183 §5, DEC-186). Every state,
// from literal fixtures: no DAL, no session. The lead renders it inside the
// playground's scope. This is the tab STRIP — never the phone tab bar,
// which is `src/components/shell/**` (DEC-183 §4.6).

export function TabsDemo() {
  return (
    <Tabs
      label="أقسام لوحة الإدارة"
      defaultValue="pending"
      items={[
        { value: "pending", label: "قيد المراجعة", count: 3 },
        { value: "approved", label: "مقبولة", count: 12 },
        { value: "rejected", label: "مرفوضة", count: 0 },
      ]}
    >
      <p className="text-body text-fg-body">محتوى القسم النشط</p>
    </Tabs>
  );
}
