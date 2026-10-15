"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { observeSubject, type ViewKind } from "@/components/views/tracker";

// One feed item, watched for a view (REQ-VEW-001, docs/plan/notes/views.md §8.1). A plain block around the item — the
// feed's column and the item's own layout are unchanged — registered with the page's one tracker while mounted. The
// children stay Server Components: a ReactNode crosses the boundary (DEC-159).
export function ViewSubject({ kind, id, children }: { kind: ViewKind; id: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observeSubject(el, { kind, id });
  }, [kind, id]);
  return (
    <div ref={ref} data-view-subject={kind}>
      {children}
    </div>
  );
}
