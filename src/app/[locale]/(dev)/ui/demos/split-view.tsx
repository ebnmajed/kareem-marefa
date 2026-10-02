"use client";

import { useId } from "react";
import { SplitView } from "@/components/ui/split-view";

// `split-view`'s gallery entry — REQ-UIX-085, REQ-UIX-088. `sessions'`; the lead's stub (contract 2), which
// `sessions` extends to every state of its plan. Literals only. No scope of its own.

const ITEMS = [
  { id: "a", href: "/app/admin/proposals/a", children: "العرض في 5 شرائح · سارة القحطاني" },
  { id: "b", href: "/app/admin/proposals/b", children: "لوحة تحكم لا يهجرها أحد · نورة العتيبي" },
  { id: "c", href: "/app/admin/proposals/c", children: "ورشة الإضاءة للمبتدئين · محمد الدوسري" },
];

const CHIPS = (
  <div className="mb-3 flex flex-wrap gap-2 text-label">
    <span className="rounded-full border border-accent px-3 py-1">بانتظار قرار 3</span>
    <span className="rounded-full border border-edge px-3 py-1">بانتظار تعديل 1</span>
    <span className="rounded-full border border-edge px-3 py-1">الكل</span>
  </div>
);

// The heading's id is the demo's own: the gallery renders every demo on two grounds, and an id is written once.
function Detail({ id }: { id: string }) {
  return (
    <div className="space-y-2">
      <h2 id={id} className="text-h2 text-fg-heading">
        لوحة تحكم لا يهجرها أحد
      </h2>
      <p className="text-body text-fg-body">قبل سنة كان تقرير الأداء الشهري يأخذ أربعة أيام من شخصين.</p>
    </div>
  );
}

export function SplitViewDemo() {
  const headingId = useId();
  return (
    <div className="flex flex-col gap-8">
      {/* The open row, the chips above the list, the detail beside it from lg. */}
      <SplitView label="المقترحات" narrow="list" currentId="b" items={ITEMS} toolbar={CHIPS} detail={<Detail id={headingId} />} detailLabelledBy={headingId} />
      {/* An item's own route below lg: the detail and its back link. */}
      <SplitView label="المقترحات" narrow="detail" currentId="c" items={ITEMS} detail={<Detail id={`${headingId}-route`} />} back={{ href: "/app/admin/proposals", label: "المقترحات" }} />
      {/* Nothing in the filter. */}
      <SplitView label="المقترحات" narrow="list" currentId={null} items={[]} toolbar={CHIPS} empty={<p className="text-body text-fg-muted">لا مقترحات بانتظار القرار</p>} detail={null} />
    </div>
  );
}
