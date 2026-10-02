"use client";

import { SplitView } from "@/components/ui/split-view";

// `split-view`'s gallery entry — REQ-UIX-085, REQ-UIX-088. `sessions'`; the lead's stub (contract 2), which
// `sessions` extends to every state of its plan. Literals only. No scope of its own.

const ITEMS = [
  { id: "a", href: "/app/admin/proposals/a", children: "العرض في 5 شرائح · سارة القحطاني" },
  { id: "b", href: "/app/admin/proposals/b", children: "لوحة تحكم لا يهجرها أحد · نورة العتيبي" },
  { id: "c", href: "/app/admin/proposals/c", children: "ورشة الإضاءة للمبتدئين · محمد الدوسري" },
];

export function SplitViewDemo() {
  return (
    <div className="flex flex-col gap-6">
      <SplitView label="المقترحات" narrow="list" currentId="b" items={ITEMS} detail={<p className="text-body text-fg-body">تفاصيل المقترح المفتوح</p>} />
      <SplitView label="المقترحات" narrow="list" currentId={null} items={[]} empty={<p className="text-body text-fg-muted">لا مقترحات بانتظار القرار</p>} detail={null} />
    </div>
  );
}
